const fs = require('fs');
const XLSX = require('xlsx');
const InventarioModel = require('../models/InventarioModel');
const InventarioDetalleModel = require('../models/InventarioDetalleModel');
const ExistenciaModel = require('../models/ExistenciaModel');
const ExistenciaCargaModel = require('../models/ExistenciaCargaModel');
const ProductoModel = require('../models/ProductoModel');
const SucursalModel = require('../models/SucursalModel');
const { parseInventarioFile } = require('../utils/excelParser');
const { resolveScan, normalizeImportedRows } = require('../utils/productResolver');
const { cleanIdentifier, toNumber, buildPagination, isValidInventorySku } = require('../utils/common');
const { setFlash, canAccessSucursal, isAdmin } = require('../middlewares/auth');

function cleanupFile(file) {
  if (file && file.path && fs.existsSync(file.path)) {
    fs.unlinkSync(file.path);
  }
}

async function loadScopedInventario(req, inventarioId) {
  const inventario = await InventarioModel.getById(inventarioId);
  if (!inventario) return null;
  if (!canAccessSucursal(req.session.user, inventario.sucursal_id)) return null;
  return inventario;
}

function buildInventarioReturnUrl(inventarioId, options) {
  const params = new URLSearchParams();
  if (options && options.search) params.set('search', String(options.search).trim());
  if (options && options.includeZero) params.set('include_zero', '1');
  const qs = params.toString();
  return '/inventarios/' + inventarioId + (qs ? '?' + qs : '');
}

async function createInventario(req, res, next) {
  try {
    const user = req.session.user;
    const sucursalId = isAdmin(user) ? Number(req.body.sucursal_id) : Number(user.sucursal_id);
    const fecha = String(req.body.fecha || '').trim();
    const origenRaw = String(req.body.origen_existencias || '').trim();
    const origenExistencias = ['con_existencia', 'con_existencias'].includes(origenRaw) ? 'con_existencia' : 'sin_existencias';
    const existenciaCargaId = req.body.existencia_carga_id ? Number(req.body.existencia_carga_id) : null;

    if (!sucursalId || !fecha) {
      setFlash(req, 'error', 'Debes indicar sucursal y fecha.');
      return res.redirect('/dashboard' + (sucursalId ? '?sucursal_id=' + sucursalId : ''));
    }

    const sucursal = await SucursalModel.getById(sucursalId);
    if (!sucursal) {
      setFlash(req, 'error', 'La sucursal seleccionada no existe.');
      return res.redirect('/dashboard');
    }

    let carga = null;
    if (origenExistencias === 'con_existencia') {
      if (!existenciaCargaId) {
        setFlash(req, 'error', 'Debes seleccionar una fecha de existencia para iniciar el inventario basado en existencias.');
        return res.redirect('/dashboard?sucursal_id=' + sucursalId);
      }
      carga = await ExistenciaCargaModel.getById(existenciaCargaId);
      if (!carga || Number(carga.sucursal_id) !== Number(sucursalId)) {
        setFlash(req, 'error', 'La fecha de existencia seleccionada no corresponde a la sucursal.');
        return res.redirect('/dashboard?sucursal_id=' + sucursalId);
      }
    }

    const inventarioId = await InventarioModel.create({
      sucursalId,
      fecha,
      createdBy: user.id,
      origenExistencias,
      existenciaCargaId: carga ? carga.id : null
    });

    setFlash(req, 'success', 'Inventario #' + inventarioId + ' creado correctamente.');
    return res.redirect('/inventarios/' + inventarioId);
  } catch (error) {
    return next(error);
  }
}

async function showInventario(req, res, next) {
  try {
    const inventarioId = Number(req.params.id);
    const inventario = await loadScopedInventario(req, inventarioId);

    if (!inventario) {
      setFlash(req, 'error', 'Inventario no encontrado o sin permiso.');
      return res.redirect('/dashboard');
    }

    const search = String(req.query.search || '').trim();
    const hasIncludeZeroParam = Object.prototype.hasOwnProperty.call(req.query, 'include_zero');
    const hasHideZeroParam = Object.prototype.hasOwnProperty.call(req.query, 'hide_zero');
    let requestedShowZero = false;
    if (hasIncludeZeroParam) {
      requestedShowZero = String(req.query.include_zero || '').trim() === '1';
    } else if (hasHideZeroParam) {
      requestedShowZero = String(req.query.hide_zero || '').trim() !== '1';
    }

    const page = Math.max(Number(req.query.page || 1), 1);
    const pageSize = 100;
    const basePagination = buildPagination(0, page, pageSize);
    const usesExistencias = ['con_existencia', 'con_existencias'].includes(inventario.origen_existencias);

    const [capturados, capturaSummary] = await Promise.all([
      InventarioDetalleModel.listByInventario(inventario.id, inventario.sucursal_id),
      InventarioDetalleModel.getSummary(inventario.id)
    ]);

    let blindSummary = {
      total_esperados: 0,
      contados: 0,
      pendientes: 0,
      con_existencia_cero: 0,
      con_existencia_distinta_cero: 0
    };
    let blindRows = [];
    let hasLoadedExistencias = false;
    let showZero = false;
    let finalPagination = buildPagination(0, page, pageSize);
    const queryParams = new URLSearchParams();

    if (usesExistencias) {
      blindSummary = await ExistenciaModel.getBlindSummary(inventario.id, inventario.sucursal_id, inventario.existencia_carga_id);
      hasLoadedExistencias = Number(blindSummary.total_esperados || 0) > 0;
      showZero = hasLoadedExistencias ? requestedShowZero : true;

      const blindResult = await ExistenciaModel.getBlindRowsPaged(inventario.id, inventario.sucursal_id, {
        search,
        showZero,
        cargaId: inventario.existencia_carga_id,
        limit: basePagination.pageSize,
        offset: basePagination.offset
      });

      blindRows = blindResult.rows;
      finalPagination = buildPagination(blindResult.total, page, pageSize);
      if (search) queryParams.set('search', search);
      if (showZero) queryParams.set('include_zero', '1');
    }

    return res.render('inventario-detalle', {
      title: 'Inventario #' + inventario.id,
      inventario,
      capturados,
      capturaSummary,
      blindSummary,
      blindRows,
      filters: { search, showZero, includeZero: showZero },
      hasLoadedExistencias,
      usesExistencias,
      pagination: finalPagination,
      baseQuery: queryParams.toString()
    });
  } catch (error) {
    return next(error);
  }
}

async function addDetalle(req, res, next) {
  try {
    const inventarioId = Number(req.body.inventario_id);
    const inventario = await loadScopedInventario(req, inventarioId);
    if (!inventario) {
      setFlash(req, 'error', 'Inventario no encontrado o sin permiso.');
      return res.redirect('/dashboard');
    }

    const returnUrl = buildInventarioReturnUrl(inventario.id, {
      search: req.body.return_search,
      includeZero: String(req.body.return_include_zero || '').trim() === '1'
    });

    if (inventario.estado === 'cerrado') {
      setFlash(req, 'error', 'El inventario ya esta cerrado.');
      return res.redirect(returnUrl);
    }

    const barcodeInput = cleanIdentifier(req.body.barcode);
    const cantidad = toNumber(req.body.cantidad);
    const modo = req.body.modo === 'sumar' ? 'sumar' : 'sobrescribir';
    if (!barcodeInput) {
      setFlash(req, 'error', 'Captura un barcode o codigo.');
      return res.redirect(returnUrl);
    }
    if (cantidad < 0) {
      setFlash(req, 'error', 'La cantidad no puede ser negativa.');
      return res.redirect(returnUrl);
    }

    const lookup = await ProductoModel.getLookupMaps();
    const resolved = resolveScan(barcodeInput, lookup);
    const skuToValidate = resolved.codigo || barcodeInput;
    if (!isValidInventorySku(skuToValidate)) {
      setFlash(req, 'error', 'Solo se permiten SKU numericos entre 1100000 y 2200000.');
      return res.redirect(returnUrl);
    }

    await InventarioDetalleModel.upsert(inventario.id, resolved.barcode, cantidad, modo);
    setFlash(req, 'success', 'Registro guardado para ' + (resolved.descripcion || resolved.barcode) + '.');
    return res.redirect(returnUrl);
  } catch (error) {
    return next(error);
  }
}

async function updateDetalle(req, res, next) {
  try {
    const inventarioId = Number(req.body.inventario_id);
    const detalleId = Number(req.params.detalleId);
    const cantidad = toNumber(req.body.cantidad);
    const inventario = await loadScopedInventario(req, inventarioId);
    if (!inventario) {
      setFlash(req, 'error', 'Inventario no encontrado o sin permiso.');
      return res.redirect('/dashboard');
    }
    if (inventario.estado === 'cerrado') {
      setFlash(req, 'error', 'El inventario esta cerrado.');
      return res.redirect('/inventarios/' + inventario.id);
    }
    if (cantidad < 0) {
      setFlash(req, 'error', 'La cantidad no puede ser negativa.');
      return res.redirect('/inventarios/' + inventario.id);
    }
    await InventarioDetalleModel.updateCantidadById(detalleId, inventario.id, cantidad);
    setFlash(req, 'success', 'Cantidad actualizada.');
    return res.redirect('/inventarios/' + inventario.id);
  } catch (error) {
    return next(error);
  }
}

async function deleteDetalle(req, res, next) {
  try {
    const inventarioId = Number(req.body.inventario_id);
    const detalleId = Number(req.params.detalleId);
    const inventario = await loadScopedInventario(req, inventarioId);
    if (!inventario) {
      setFlash(req, 'error', 'Inventario no encontrado o sin permiso.');
      return res.redirect('/dashboard');
    }
    if (inventario.estado === 'cerrado') {
      setFlash(req, 'error', 'El inventario esta cerrado.');
      return res.redirect('/inventarios/' + inventario.id);
    }
    await InventarioDetalleModel.deleteById(detalleId, inventario.id);
    setFlash(req, 'success', 'Registro eliminado.');
    return res.redirect('/inventarios/' + inventario.id);
  } catch (error) {
    return next(error);
  }
}

async function closeInventario(req, res, next) {
  try {
    const inventarioId = Number(req.params.id);
    const inventario = await loadScopedInventario(req, inventarioId);
    if (!inventario) {
      setFlash(req, 'error', 'Inventario no encontrado o sin permiso.');
      return res.redirect('/dashboard');
    }
    await InventarioModel.close(inventario.id);
    setFlash(req, 'success', 'Inventario cerrado.');
    return res.redirect('/inventarios/' + inventario.id);
  } catch (error) {
    return next(error);
  }
}

async function uploadInventarioArchivo(req, res, next) {
  try {
    const inventarioId = Number(req.params.id);
    const inventario = await loadScopedInventario(req, inventarioId);
    if (!inventario) {
      setFlash(req, 'error', 'Inventario no encontrado o sin permiso.');
      return res.redirect('/dashboard');
    }
    if (inventario.estado === 'cerrado') {
      setFlash(req, 'error', 'El inventario ya esta cerrado.');
      return res.redirect('/inventarios/' + inventario.id);
    }
    if (!req.file) {
      setFlash(req, 'error', 'Selecciona un archivo para importar.');
      return res.redirect('/inventarios/' + inventario.id);
    }

    const modo = req.body.modo === 'sumar' ? 'sumar' : 'sobrescribir';
    const parsedRows = parseInventarioFile(req.file.path);
    const lookup = await ProductoModel.getLookupMaps();
    const normalizedRows = normalizeImportedRows(parsedRows, lookup, { enforceSkuRange: true });

    await InventarioDetalleModel.bulkUpsert(inventario.id, normalizedRows, modo);
    setFlash(req, 'success', 'Archivo importado. Registros validos: ' + normalizedRows.length + '. Se omitieron filas fuera de rango o sin identificador valido.');
    return res.redirect('/inventarios/' + inventario.id);
  } catch (error) {
    return next(error);
  } finally {
    cleanupFile(req.file);
  }
}

async function exportInventario(req, res, next) {
  try {
    const inventarioId = Number(req.params.inventario_id);
    const tipo = req.query.tipo === 'sku' ? 'sku' : 'barcode';
    const inventario = await loadScopedInventario(req, inventarioId);
    if (!inventario) {
      setFlash(req, 'error', 'Inventario no encontrado o sin permiso.');
      return res.redirect('/dashboard');
    }

    const rows = await InventarioDetalleModel.getExportRows(inventario.id);
    const sheetRows = [tipo === 'sku' ? ['sku', 'cantidad_contada'] : ['barcode', 'cantidad_contada']];
    rows.forEach((row) => sheetRows.push([tipo === 'sku' ? row.codigo : row.barcode, row.cantidad]));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventario');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xls' });
    res.setHeader('Content-Type', 'application/vnd.ms-excel');
    res.setHeader('Content-Disposition', 'attachment; filename="inventario_' + inventario.id + '_' + tipo + '.xls"');
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createInventario,
  showInventario,
  addDetalle,
  updateDetalle,
  deleteDetalle,
  closeInventario,
  uploadInventarioArchivo,
  exportInventario
};
