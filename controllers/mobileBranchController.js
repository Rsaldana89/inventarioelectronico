const SucursalModel = require('../models/SucursalModel')
const ExistenciaCargaModel = require('../models/ExistenciaCargaModel')
const ExistenciaModel = require('../models/ExistenciaModel')

function isControlRole(apiUser) {
  return Boolean(apiUser && ['admin', 'manager'].includes(String(apiUser.rol || '').toLowerCase()))
}

function dateOnly(value) {
  if (!value) return null
  if (typeof value === 'string') return value.slice(0, 10)
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}

function formatBranchLabel(sucursal) {
  const code = String(sucursal.codigo || '').trim()
  const name = String(sucursal.nombre || '').trim()
  if (code && name && !name.startsWith(code)) return `${code} - ${name}`
  return name || code || String(sucursal.id)
}

function mapBranch(sucursal, currentProforma, productCount) {
  const hasCurrentMonthProforma = Boolean(currentProforma && currentProforma.id)
  return {
    id: Number(sucursal.id),
    code: sucursal.codigo ? String(sucursal.codigo) : null,
    type: sucursal.tipo || 'sucursal',
    name: sucursal.nombre || '',
    label: formatBranchLabel(sucursal),
    hasCurrentMonthProforma,
    currentProformaId: hasCurrentMonthProforma ? Number(currentProforma.id) : null,
    currentProformaDate: hasCurrentMonthProforma ? dateOnly(currentProforma.fecha_existencia) : null,
    proformaLoadedAt: hasCurrentMonthProforma ? currentProforma.created_at : null,
    productCount: Number(productCount || 0),
    canStartInventory: hasCurrentMonthProforma,
    disabledReason: hasCurrentMonthProforma ? null : 'No se puede iniciar inventario porque la proforma no ha sido cargada para el mes.'
  }
}

async function listBranches(req, res, next) {
  try {
    let sucursales = []

    if (isControlRole(req.apiUser)) {
      sucursales = await SucursalModel.getAll()
    } else if (req.apiUser && req.apiUser.sucursal_id) {
      const sucursal = await SucursalModel.getById(Number(req.apiUser.sucursal_id))
      sucursales = sucursal ? [sucursal] : []
    }

    const ids = sucursales.map((sucursal) => Number(sucursal.id)).filter(Boolean)
    const proformasBySucursal = await ExistenciaCargaModel.getCurrentMonthMap(ids)
    const cargaIds = Array.from(proformasBySucursal.values()).map((carga) => Number(carga.id)).filter(Boolean)
    const productCountsByCarga = await ExistenciaModel.countByCargaIds(cargaIds)

    return res.status(200).json(
      sucursales.map((sucursal) => {
        const currentProforma = proformasBySucursal.get(Number(sucursal.id)) || null
        const productCount = currentProforma ? productCountsByCarga.get(Number(currentProforma.id)) : 0
        return mapBranch(sucursal, currentProforma, productCount)
      })
    )
  } catch (error) {
    return next(error)
  }
}

async function getBranchCatalog(req, res, next) {
  try {
    const sucursal = await resolveBranchForApiUser(req.apiUser, req.params.branchId || req.query.branchId || req.query.branchCode || req.query.branch)
    if (!sucursal) {
      return res.status(404).json({ error: 'Sucursal no encontrada o sin permiso.' })
    }

    const currentProforma = await ExistenciaCargaModel.getCurrentMonthBySucursal(Number(sucursal.id))
    if (!currentProforma) {
      return res.status(409).json({
        code: 'PROFORMA_REQUIRED',
        error: 'No se puede iniciar inventario porque la proforma no ha sido cargada para el mes.'
      })
    }

    const rows = await ExistenciaModel.listCatalogByCarga(Number(currentProforma.id))
    return res.status(200).json(rows)
  } catch (error) {
    return next(error)
  }
}

async function resolveBranchForApiUser(apiUser, branchIdentifier) {
  if (!apiUser) return null

  if (!isControlRole(apiUser)) {
    if (!apiUser.sucursal_id) return null
    return SucursalModel.getById(Number(apiUser.sucursal_id))
  }

  const rawIdentifier = String(branchIdentifier || '').trim()
  if (!rawIdentifier) return null

  return SucursalModel.findByIdCodigoOrName(rawIdentifier)
}

module.exports = {
  listBranches,
  getBranchCatalog,
  resolveBranchForApiUser,
  isControlRole
}
