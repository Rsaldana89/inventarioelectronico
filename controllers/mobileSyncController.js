const db = require('../db')
const InventarioModel = require('../models/InventarioModel')
const InventarioDetalleModel = require('../models/InventarioDetalleModel')
const SucursalModel = require('../models/SucursalModel')
const ExistenciaCargaModel = require('../models/ExistenciaCargaModel')
const ExistenciaModel = require('../models/ExistenciaModel')
const ProductoModel = require('../models/ProductoModel')
const { cleanIdentifier, toNumber } = require('../utils/common')
const { isControlRole } = require('./mobileBranchController')

async function syncInventory(req, res, next) {
  let connection = null

  try {
    connection = await db.getConnection()

    const inventoryPayload = req.body && req.body.inventory ? req.body.inventory : {}
    const itemsPayload = Array.isArray(req.body && req.body.items) ? req.body.items : []
    const externalId = String(inventoryPayload.id || '').trim()

    if (!externalId) {
      return res.status(400).json({ error: 'inventory.id es obligatorio.' })
    }

    const sucursal = await resolveSucursal(req.apiUser, inventoryPayload)
    if (!sucursal) {
      return res.status(400).json({ error: 'No se pudo resolver la sucursal para esta sesion.' })
    }

    await connection.beginTransaction()

    let existing = null
    const remoteId = String(inventoryPayload.remoteId || '').trim()

    if (/^\d+$/.test(remoteId)) {
      existing = await InventarioModel.getById(Number(remoteId), connection)
    }

    if (!existing) {
      existing = await InventarioModel.getByExternalId(externalId, connection)
    }

    if (existing) {
      if (Number(existing.sucursal_id) !== Number(sucursal.id)) {
        await connection.rollback()
        return res.status(403).json({ error: 'El inventario pertenece a otra sucursal.' })
      }

      if (existing.estado === 'cerrado') {
        await connection.rollback()
        return res.status(409).json({ error: 'El inventario ya esta cerrado en el servidor.' })
      }
    }

    const carga = await resolveCargaForInventory(existing, sucursal.id)
    if (!carga) {
      await connection.rollback()
      return res.status(409).json({
        code: 'PROFORMA_REQUIRED',
        error: 'No se puede iniciar inventario porque la proforma no ha sido cargada para el mes.'
      })
    }

    const proformaLookup = await ExistenciaModel.getIdentifierLookupByCarga(Number(carga.id))
    // Build a lookup map of the entire product catalog to allow scanning of
    // products outside the proforma.  The lookup maps both barcodes and
    // códigos to a canonical identifier (prefer barcode over código).
    const catalogMaps = await ProductoModel.getLookupMaps()
    const catalogLookup = new Map()
    ;['byCodigo', 'byBarcode'].forEach(function (key) {
      const map = catalogMaps[key] || new Map()
      map.forEach(function (value, k) {
        const canonical = String(value.barcode || value.codigo || '').trim()
        if (!k || !canonical) return
        catalogLookup.set(String(k).trim(), canonical)
      })
    })
    const normalizedItems = normalizeItems(itemsPayload)
    const validation = normalizeItemsAgainstProforma(normalizedItems, proformaLookup, catalogLookup)

    if (validation.rejectedItems.length) {
      await connection.rollback()
      return res.status(422).json({
        code: 'ITEMS_NOT_IN_CATALOG',
        error: 'El inventario contiene códigos que no pertenecen ni a la proforma ni al catálogo.',
        invalidItems: validation.rejectedItems.slice(0, 25)
      })
    }

    if (!validation.detailRows.length) {
      await connection.rollback()
      return res.status(400).json({ error: 'No se recibieron partidas validas para sincronizar.' })
    }

    const fecha = toSqlDate(inventoryPayload.createdAt)
    const safeName = buildDescriptiveInventoryName(inventoryPayload.name, sucursal.nombre, inventoryPayload.createdAt)

    let inventarioId = existing ? Number(existing.id) : null

    const inventoryData = {
      externalId,
      nombre: safeName,
      sucursalId: Number(sucursal.id),
      fecha,
      createdBy: req.apiUser.id,
      origen: 'mobile',
      origenExistencias: 'con_existencia',
      existenciaCargaId: Number(carga.id)
    }

    if (inventarioId) {
      await InventarioModel.updateFromMobile(
        {
          id: inventarioId,
          ...inventoryData
        },
        connection
      )
    } else {
      inventarioId = await InventarioModel.createFromMobile(inventoryData, connection)
    }

    await InventarioDetalleModel.bulkUpsertWithExecutor(connection, inventarioId, validation.detailRows, 'sobrescribir')
    await connection.commit()

    return res.status(200).json({
      remoteId: String(inventarioId),
      acceptedItems: validation.detailRows.length,
      status: 'ok',
      proformaId: Number(carga.id)
    })
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback()
      } catch (rollbackError) {
        console.error('No se pudo revertir la transaccion de sync:', rollbackError.message)
      }
    }

    return next(error)
  } finally {
    if (connection) {
      connection.release()
    }
  }
}

async function resolveCargaForInventory(existing, sucursalId) {
  if (existing && existing.existencia_carga_id) {
    const carga = await ExistenciaCargaModel.getById(Number(existing.existencia_carga_id))
    if (carga && Number(carga.sucursal_id) === Number(sucursalId)) {
      return carga
    }
  }

  return ExistenciaCargaModel.getCurrentMonthBySucursal(Number(sucursalId))
}

function buildDescriptiveInventoryName(providedName, branchName, createdAt) {
  const rawName = String(providedName || '').trim()
  const cleanBranch = String(branchName || '').trim() || 'Sucursal'
  const timestamp = Number(createdAt)
  const date = Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp) : new Date()
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date
  const yyyy = safeDate.getFullYear()
  const mm = String(safeDate.getMonth() + 1).padStart(2, '0')
  const dd = String(safeDate.getDate()).padStart(2, '0')
  const hh = String(safeDate.getHours()).padStart(2, '0')
  const mi = String(safeDate.getMinutes()).padStart(2, '0')
  const descriptiveName = `Inventario ${cleanBranch} ${yyyy}-${mm}-${dd} ${hh}:${mi}`

  if (!rawName || /^inventario\s*$/i.test(rawName) || rawName.toLowerCase() === ('inventario ' + cleanBranch).toLowerCase()) {
    return descriptiveName
  }

  if (!rawName.toLowerCase().includes(cleanBranch.toLowerCase())) {
    return `${rawName} - ${cleanBranch} ${yyyy}-${mm}-${dd} ${hh}:${mi}`
  }

  return rawName
}

function normalizeItems(items) {
  const byIdentifier = new Map()

  items.forEach(function eachItem(item) {
    const barcode = cleanIdentifier(item && item.barcode)
    const sku = cleanIdentifier(item && item.sku)
    const identifier = barcode || sku
    const quantity = Math.max(toNumber(item && item.quantity), 0)
    const updatedAt = Number(item && item.updatedAt ? item.updatedAt : 0)

    if (!identifier) {
      return
    }

    const current = byIdentifier.get(identifier)
    const normalized = {
      barcode,
      sku,
      identifier,
      quantity,
      updatedAt
    }

    if (!current || updatedAt >= current.updatedAt) {
      byIdentifier.set(identifier, normalized)
    }
  })

  return Array.from(byIdentifier.values())
}

function normalizeItemsAgainstProforma(items, proformaLookup, catalogLookup) {
  // Aggregates quantities by canonical barcode.  Items are accepted if they
  // belong to the proforma (matched in proformaLookup) or if they exist in
  // the broader product catalog (matched in catalogLookup).  Items that do
  // not exist in either lookup are considered invalid and reported back to
  // the caller.
  const aggregated = new Map()
  const rejectedItems = []

  for (const item of items) {
    let matchedBarcode =
      (item.barcode && proformaLookup.get(item.barcode)) ||
      (item.sku && proformaLookup.get(item.sku)) ||
      (item.identifier && proformaLookup.get(item.identifier)) ||
      null

    // If not found in the proforma, try to resolve against the full catalog.
    if (!matchedBarcode && catalogLookup) {
      matchedBarcode =
        (item.barcode && catalogLookup.get(item.barcode)) ||
        (item.sku && catalogLookup.get(item.sku)) ||
        (item.identifier && catalogLookup.get(item.identifier)) ||
        null
    }

    if (!matchedBarcode) {
      rejectedItems.push({ barcode: item.barcode || null, sku: item.sku || null })
      continue
    }

    const current = aggregated.get(matchedBarcode) || { barcode: matchedBarcode, cantidad: 0 }
    current.cantidad = Number((current.cantidad + item.quantity).toFixed(2))
    aggregated.set(matchedBarcode, current)
  }

  return {
    detailRows: Array.from(aggregated.values()),
    rejectedItems
  }
}

async function resolveSucursal(apiUser, inventoryPayload) {
  if (!apiUser) return null

  if (apiUser.sucursal_id && !isControlRole(apiUser)) {
    return {
      id: Number(apiUser.sucursal_id),
      codigo: apiUser.sucursal_codigo || null,
      nombre: apiUser.sucursal_nombre || String(inventoryPayload.branch || '').trim() || 'Sucursal'
    }
  }

  const branchId = inventoryPayload.branchId || inventoryPayload.sucursalId || null
  const branchCode = inventoryPayload.branchCode || inventoryPayload.sucursalCode || null
  const branch = inventoryPayload.branch || null
  const identifier = branchId || branchCode || branch

  if (!identifier) {
    if (apiUser.sucursal_id) {
      return SucursalModel.getById(Number(apiUser.sucursal_id))
    }
    return null
  }

  return SucursalModel.findByIdCodigoOrName(identifier)
}

function toSqlDate(value) {
  const timestamp = Number(value)
  const date = Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp) : new Date()

  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10)
  }

  return date.toISOString().slice(0, 10)
}

module.exports = {
  syncInventory
}
