const fs = require('fs');
const SucursalModel = require('../models/SucursalModel');
const ExistenciaModel = require('../models/ExistenciaModel');
const ExistenciaCargaModel = require('../models/ExistenciaCargaModel');
const ProductoModel = require('../models/ProductoModel');
const { parseCatalogFile } = require('../utils/catalogParser');
const { parseExistenciasFile } = require('../utils/excelParser');
const { normalizeImportedRows } = require('../utils/productResolver');
const { buildPagination, isValidInventorySku } = require('../utils/common');
const { setFlash, canAccessSucursal, isAdmin } = require('../middlewares/auth');

function cleanupFile(file) {
  if (file && file.path && fs.existsSync(file.path)) {
    fs.unlinkSync(file.path);
  }
}

function getSucursalIdFromRequest(req) {
  const user = req.session.user;
  if (isAdmin(user)) {
    const value = req.body.sucursal_id || req.query.sucursal_id;
    return value ? Number(value) : null;
  }
  return Number(user.sucursal_id);
}

async function showExistencias(req, res, next) {
  try {
    const user = req.session.user;
    const sucursales = await SucursalModel.getAll();
    let selectedSucursalId = getSucursalIdFromRequest(req);

    // Si el usuario no es admin/manager (es decir, es una sucursal), se preselecciona la primera sucursal.
    // Para administradores y managers no se preselecciona ninguna, obligando a elegir explicitamente.
    if (!selectedSucursalId && sucursales.length) {
      const { isAdmin } = require('../middlewares/auth');
      if (!isAdmin(user)) {
        selectedSucursalId = sucursales[0].id;
      }
    }
    if (selectedSucursalId && !canAccessSucursal(user, selectedSucursalId)) {
      setFlash(req, 'error', 'No tienes permiso para consultar esa sucursal.');
      return res.redirect('/dashboard');
    }

    const search = String(req.query.search || '').trim();
    const page = Math.max(Number(req.query.page || 1), 1);
    const pageSize = 100;
    const pagination = buildPagination(0, page, pageSize);

    let summary = { items: 0, unidades: 0 };
    let result = { total: 0, rows: [] };
    let sucursalActual = null;
    let cargasExistencia = [];

    if (selectedSucursalId) {
      [summary, result, sucursalActual, cargasExistencia] = await Promise.all([
        ExistenciaModel.getSummaryBySucursal(selectedSucursalId),
        ExistenciaModel.listPagedBySucursal(selectedSucursalId, {
          search,
          limit: pagination.pageSize,
          offset: pagination.offset
        }),
        SucursalModel.getById(selectedSucursalId),
        ExistenciaCargaModel.listBySucursal(selectedSucursalId)
      ]);
    }

    const finalPagination = buildPagination(result.total, page, pageSize);
    const queryParams = new URLSearchParams();
    if (selectedSucursalId) queryParams.set('sucursal_id', String(selectedSucursalId));
    if (search) queryParams.set('search', search);

    const catalogUpdatedAt = await ProductoModel.getLastUpdatedAt();

    return res.render('existencias', {
      title: 'Existencias',
      sucursales,
      sucursalActual,
      selectedSucursalId,
      existencias: result.rows,
      summary,
      productCount: await ProductoModel.count(),
      catalogUpdatedAt,
      cargasExistencia,
      filters: { search },
      pagination: finalPagination,
      baseQuery: queryParams.toString()
    });
  } catch (error) {
    return next(error);
  }
}

async function uploadCatalogo(req, res, next) {
  try {
    if (!req.file) {
      setFlash(req, 'error', 'Selecciona un archivo de catalogo.');
      return res.redirect('/existencias');
    }

    const parsedProducts = parseCatalogFile(req.file.path);
    const products = parsedProducts.filter((product) => product && isValidInventorySku(product.codigo));
    const skippedProducts = Math.max(parsedProducts.length - products.length, 0);

    await ProductoModel.replaceAll(products);
    setFlash(req, 'success', 'Catalogo actualizado con ' + products.length + ' productos validos. Omitidos fuera de rango 1100000-2200000: ' + skippedProducts + '.');
    return res.redirect('/existencias');
  } catch (error) {
    return next(error);
  } finally {
    cleanupFile(req.file);
  }
}

async function deleteCatalogo(req, res, next) {
  try {
    await ProductoModel.truncateAll();
    setFlash(req, 'success', 'Catalogo eliminado correctamente.');
    return res.redirect('/existencias');
  } catch (error) {
    return next(error);
  }
}

async function uploadExistencias(req, res, next) {
  const sucursalId = getSucursalIdFromRequest(req);

  try {
    if (!sucursalId) {
      setFlash(req, 'error', 'Debes seleccionar una sucursal.');
      return res.redirect('/existencias');
    }
    if (!canAccessSucursal(req.session.user, sucursalId)) {
      setFlash(req, 'error', 'No tienes permiso para cargar existencias en esa sucursal.');
      return res.redirect('/dashboard');
    }
    if (!req.file) {
      setFlash(req, 'error', 'Selecciona un archivo de existencias.');
      return res.redirect('/existencias?sucursal_id=' + sucursalId);
    }

    const fechaExistencia = String(req.body.fecha_existencia || '').trim();
    if (!fechaExistencia) {
      setFlash(req, 'error', 'Debes indicar la fecha de la existencia.');
      return res.redirect('/existencias?sucursal_id=' + sucursalId);
    }

    const rows = parseExistenciasFile(req.file.path);
    const lookup = await ProductoModel.getLookupMaps();
    const normalizedRows = normalizeImportedRows(rows, lookup, { enforceSkuRange: true });
    const skippedRows = Math.max(rows.length - normalizedRows.length, 0);
    const cargaId = await ExistenciaCargaModel.create(sucursalId, fechaExistencia, req.session.user.id);

    await ExistenciaModel.replaceForSucursal(sucursalId, normalizedRows, { cargaId });
    setFlash(req, 'success', 'Existencias cargadas para la sucursal. Fecha: ' + fechaExistencia + '. Registros validos: ' + normalizedRows.length + '. Omitidos fuera de rango: ' + skippedRows + '.');
    return res.redirect('/existencias?sucursal_id=' + sucursalId);
  } catch (error) {
    return next(error);
  } finally {
    cleanupFile(req.file);
  }
}

module.exports = {
  showExistencias,
  uploadCatalogo,
  deleteCatalogo,
  uploadExistencias
};
