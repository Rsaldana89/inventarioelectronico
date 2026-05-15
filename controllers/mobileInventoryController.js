const InventarioModel = require('../models/InventarioModel')
const InventarioDetalleModel = require('../models/InventarioDetalleModel')
const ExistenciaModel = require('../models/ExistenciaModel')
const { resolveBranchForApiUser, isControlRole } = require('./mobileBranchController')

function toMillis(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

function dateOnly(value) {
  if (!value) return null
  if (typeof value === 'string') return value.slice(0, 10)
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}

function assertBranchUser(req, inventario) {
  const apiSucursalId = req.apiUser && req.apiUser.sucursal_id
  if (!apiSucursalId || isControlRole(req.apiUser)) return true
  return Number(apiSucursalId) === Number(inventario.sucursal_id)
}

function mapInventory(row) {
  return {
    id: String(row.id),
    remoteId: String(row.id),
    externalId: row.external_id ? String(row.external_id) : null,
    name: row.nombre || ('Inventario ' + (row.sucursal_nombre || '')).trim(),
    branch: row.sucursal_nombre || '',
    branchId: Number(row.sucursal_id),
    branchCode: row.sucursal_codigo ? String(row.sucursal_codigo) : null,
    status: row.estado,
    createdAt: toMillis(row.created_at),
    updatedAt: toMillis(row.updated_at),
    fecha: dateOnly(row.fecha),
    proformaId: row.existencia_carga_id ? Number(row.existencia_carga_id) : null,
    proformaDate: dateOnly(row.fecha_existencia),
    itemCount: Number(row.registros_capturados || 0),
    totalQuantity: Number(row.unidades_capturadas || 0)
  }
}

async function listOpenInventories(req, res, next) {
  try {
    const requestedBranch = req.query.branchId || req.query.branchCode || req.query.branch || ''
    const sucursal = await resolveBranchForApiUser(req.apiUser, requestedBranch)

    if (!sucursal) {
      const message = isControlRole(req.apiUser)
        ? 'Selecciona una sucursal para consultar inventarios abiertos.'
        : 'No se pudo determinar la sucursal de la sesion.'
      return res.status(400).json({ error: message })
    }

    const rows = await InventarioModel.listOpenBySucursal(Number(sucursal.id))
    return res.status(200).json(rows.map(mapInventory))
  } catch (error) {
    return next(error)
  }
}

async function getInventoryDetails(req, res, next) {
  try {
    const id = String(req.params.id || '').trim()
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ error: 'Identificador de inventario invalido.' })
    }

    const inventario = await InventarioModel.getById(Number(id))
    if (!inventario) {
      return res.status(404).json({ error: 'Inventario no encontrado.' })
    }
    if (!assertBranchUser(req, inventario)) {
      return res.status(403).json({ error: 'El inventario pertenece a otra sucursal.' })
    }
    if (inventario.estado === 'cerrado') {
      return res.status(409).json({ error: 'El inventario ya esta cerrado.' })
    }

    const items = await InventarioDetalleModel.listForMobileByInventario(inventario.id, inventario.sucursal_id)
    // Obtener resumen ciego de la proforma para incluir las métricas de esperados y contados.
    let summary = null
    try {
      summary = await ExistenciaModel.getBlindSummary(
        inventario.id,
        inventario.sucursal_id,
        inventario.existencia_carga_id || null
      )
    } catch (_e) {
      summary = null
    }
    return res.status(200).json({
      id: String(inventario.id),
      remoteId: String(inventario.id),
      externalId: inventario.external_id ? String(inventario.external_id) : null,
      name: inventario.nombre || ('Inventario ' + inventario.sucursal_nombre).trim(),
      branch: inventario.sucursal_nombre || '',
      branchId: Number(inventario.sucursal_id),
      branchCode: inventario.sucursal_codigo ? String(inventario.sucursal_codigo) : null,
      status: inventario.estado,
      createdAt: toMillis(inventario.created_at),
      updatedAt: toMillis(inventario.updated_at),
      fecha: dateOnly(inventario.fecha),
      proformaId: inventario.existencia_carga_id ? Number(inventario.existencia_carga_id) : null,
      proformaDate: dateOnly(inventario.fecha_existencia),
      expectedItemCount: summary ? Number(summary.total_esperados || 0) : null,
      countedItemCount: summary ? Number(summary.contados || 0) : null,
      items: items.map(function mapItem(item) {
        return {
          id: String(item.id),
          barcode: item.barcode,
          sku: item.codigo || item.barcode,
          productName: item.descripcion || 'Desconocido',
          quantity: Number(item.cantidad || 0),
          isUnknown: !item.descripcion || item.descripcion === 'Desconocido',
          updatedAt: toMillis(item.updated_at)
        }
      })
    })
  } catch (error) {
    return next(error)
  }
}

async function deleteInventory(req, res, next) {
  try {
    const id = String(req.params.id || '').trim()
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ error: 'Identificador de inventario invalido.' })
    }

    const inventario = await InventarioModel.getById(Number(id))
    if (!inventario) {
      return res.status(404).json({ error: 'Inventario no encontrado.' })
    }
    if (!assertBranchUser(req, inventario)) {
      return res.status(403).json({ error: 'El inventario pertenece a otra sucursal.' })
    }
    if (inventario.estado === 'cerrado') {
      return res.status(409).json({ error: 'Inventario cerrado. Solo un administrador puede eliminarlo desde la app web.' })
    }

    await InventarioModel.deleteOpenById(Number(id))
    return res.status(200).json({ status: 'deleted', remoteId: String(id) })
  } catch (error) {
    return next(error)
  }
}

module.exports = {
  listOpenInventories,
  getInventoryDetails,
  deleteInventory
  ,
  /**
   * Obtener un resumen ciego del inventario (productos esperados y contados).
   *
   * Devuelve el número total de productos esperados según la proforma, cuántos
   * se han contado, cuántos quedan pendientes y estadísticas de existencias
   * con cero o mayor a cero.  Se puede utilizar para mostrar barras de
   * progreso en la aplicación móvil.
   */
  async getInventorySummary(req, res, next) {
    try {
      const id = String(req.params.id || '').trim()
      if (!/^\d+$/.test(id)) {
        return res.status(400).json({ error: 'Identificador de inventario invalido.' })
      }
      const inventario = await InventarioModel.getById(Number(id))
      if (!inventario) {
        return res.status(404).json({ error: 'Inventario no encontrado.' })
      }
      if (!assertBranchUser(req, inventario)) {
        return res.status(403).json({ error: 'El inventario pertenece a otra sucursal.' })
      }
      // Obtener estadísticos ciegos: total esperados, contados, pendientes, etc.
      const summary = await ExistenciaModel.getBlindSummary(
        inventario.id,
        inventario.sucursal_id,
        inventario.existencia_carga_id || null
      )
      return res.status(200).json({
        expected: Number(summary.total_esperados || 0),
        counted: Number(summary.contados || 0),
        pending: Number(summary.pendientes || 0),
        zeroCount: Number(summary.con_existencia_cero || 0),
        nonZero: Number(summary.con_existencia_distinta_cero || 0)
      })
    } catch (error) {
      return next(error)
    }
  },
  /**
   * Listar los productos de la proforma junto con lo contado para un
   * inventario.  Permite paginación y búsqueda opcional.
   *
   * Query params:
   *   - search: texto para filtrar por código, barcode o descripción.
   *   - limit: número máximo de filas a regresar (default 200).
   *   - offset: desplazamiento para paginación.
   *   - showZero: 'true' para incluir existencias con cantidad 0.
   */
  async getInventoryProforma(req, res, next) {
    try {
      const id = String(req.params.id || '').trim()
      if (!/^\d+$/.test(id)) {
        return res.status(400).json({ error: 'Identificador de inventario invalido.' })
      }
      const inventario = await InventarioModel.getById(Number(id))
      if (!inventario) {
        return res.status(404).json({ error: 'Inventario no encontrado.' })
      }
      if (!assertBranchUser(req, inventario)) {
        return res.status(403).json({ error: 'El inventario pertenece a otra sucursal.' })
      }
      // Construir opciones de consulta.
      const search = String(req.query.search || '').trim()
      const limit = Number(req.query.limit) > 0 ? Number(req.query.limit) : 200
      const offset = Number(req.query.offset) > 0 ? Number(req.query.offset) : 0
      const showZero = String(req.query.showZero || '').toLowerCase() === 'true' || req.query.showZero === '1'
      const options = {
        search,
        limit,
        offset,
        showZero,
        cargaId: inventario.existencia_carga_id || null
      }
      const result = await ExistenciaModel.getBlindRowsPaged(
        inventario.id,
        inventario.sucursal_id,
        options
      )
      const rows = (result.rows || []).map(function mapRow(row) {
        const canonical = String(row.barcode || row.codigo || '')
        return {
          barcode: canonical,
          sku: String(row.codigo || ''),
          productName: String(row.descripcion || ''),
          expectedQuantity: Number(row.cantidad_esperada || 0),
          countedQuantity: Number(row.cantidad_contada || 0),
          state: String(row.estado || '')
        }
      })
      return res.status(200).json({ total: Number(result.total || 0), rows })
    } catch (error) {
      return next(error)
    }
  }
}
