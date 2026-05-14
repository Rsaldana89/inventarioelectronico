const InventarioModel = require('../models/InventarioModel')
const InventarioDetalleModel = require('../models/InventarioDetalleModel')
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
}
