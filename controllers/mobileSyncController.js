const db = require('../db')
const InventarioModel = require('../models/InventarioModel')
const InventarioDetalleModel = require('../models/InventarioDetalleModel')
const SucursalModel = require('../models/SucursalModel')
const { cleanIdentifier, toNumber } = require('../utils/common')

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

    const sucursal = await resolveSucursal(req.apiUser, inventoryPayload.branch)
    if (!sucursal) {
      return res.status(400).json({ error: 'No se pudo resolver la sucursal para esta sesion.' })
    }

    const normalizedItems = normalizeItems(itemsPayload)

    if (!normalizedItems.length) {
      return res.status(400).json({ error: 'No se recibieron partidas validas para sincronizar.' })
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

    const fecha = toSqlDate(inventoryPayload.createdAt)
    const safeName = buildDescriptiveInventoryName(inventoryPayload.name, sucursal.nombre, inventoryPayload.createdAt)

    let inventarioId = existing ? Number(existing.id) : null

    if (inventarioId) {
      await InventarioModel.updateFromMobile(
        {
          id: inventarioId,
          externalId,
          nombre: safeName,
          sucursalId: Number(sucursal.id),
          fecha,
          createdBy: req.apiUser.id,
          origen: 'mobile'
        },
        connection
      )
    } else {
      inventarioId = await InventarioModel.createFromMobile(
        {
          externalId,
          nombre: safeName,
          sucursalId: Number(sucursal.id),
          fecha,
          createdBy: req.apiUser.id,
          origen: 'mobile'
        },
        connection
      )
    }

    const detailRows = normalizedItems.map(function mapItem(item) {
      return {
        barcode: item.barcode,
        cantidad: item.quantity
      }
    })

    await InventarioDetalleModel.bulkUpsertWithExecutor(connection, inventarioId, detailRows, 'sobrescribir')
    await connection.commit()

    return res.status(200).json({
      remoteId: String(inventarioId),
      acceptedItems: detailRows.length,
      status: 'ok'
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
  const byBarcode = new Map()

  items.forEach(function eachItem(item) {
    const barcode = cleanIdentifier(item && (item.barcode || item.sku || ''))
    const quantity = Math.max(toNumber(item && item.quantity), 0)
    const updatedAt = Number(item && item.updatedAt ? item.updatedAt : 0)

    if (!barcode) {
      return
    }

    const current = byBarcode.get(barcode)
    const normalized = {
      barcode,
      quantity,
      updatedAt
    }

    if (!current || updatedAt >= current.updatedAt) {
      byBarcode.set(barcode, normalized)
    }
  })

  return Array.from(byBarcode.values())
}

async function resolveSucursal(apiUser, branch) {
  if (apiUser && apiUser.sucursal_id) {
    return {
      id: Number(apiUser.sucursal_id),
      nombre: apiUser.sucursal_nombre || String(branch || '').trim() || 'Sucursal'
    }
  }

  const normalizedBranch = String(branch || '').trim()
  if (!normalizedBranch) {
    return null
  }

  return SucursalModel.findByName(normalizedBranch)
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
