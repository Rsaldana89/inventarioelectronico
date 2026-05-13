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
const { generateTextPdf } = require('../utils/pdfGenerator');

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

    // Determine if the current user should see expected quantities.  Only admins and managers
    // (as defined by isAdmin) can see expected quantities; store users see a blind list.
    const hideExpectedQuantity = !isAdmin(req.session.user);

    // Fetch the date of the most recent proforma (existencias carga) for this branch.  Even if the
    // current inventory was created without a proforma, we display the last upload date so that
    // store users can see when the baseline was last updated.  If no proforma exists, the
    // value will be null.
    let lastProformaDate = null;
    try {
      const cargas = await ExistenciaCargaModel.listBySucursal(inventario.sucursal_id);
      if (cargas && cargas.length) {
        lastProformaDate = cargas[0].fecha_existencia;
      }
    } catch (err) {
      // ignore errors when fetching last proforma date; leave lastProformaDate null
    }

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
      baseQuery: queryParams.toString(),
      hideExpectedQuantity,
      lastProformaDate
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
      setFlash(req, 'error', 'Solo se permiten SKU numéricos entre 1101001 y 9905007.');
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

/**
 * Delete an inventory regardless of its status.  Only administrators
 * and managers should reach this handler (enforced by route middleware).
 * When invoked the inventory and its captured details are removed from
 * the database.  If the inventory does not exist or the user lacks
 * permission, the request is redirected with an error.
 */
async function deleteInventario(req, res, next) {
  try {
    const inventarioId = Number(req.params.id);
    if (!inventarioId) {
      setFlash(req, 'error', 'Identificador de inventario inválido.');
      return res.redirect('/dashboard');
    }
    const inventario = await loadScopedInventario(req, inventarioId);
    if (!inventario) {
      setFlash(req, 'error', 'Inventario no encontrado o sin permiso.');
      return res.redirect('/dashboard');
    }
    // Only administrators and managers may delete inventories.  The route should
    // already apply ensureAdmin, but double-check at runtime for safety.
    if (!isAdmin(req.session.user)) {
      setFlash(req, 'error', 'No tienes permiso para eliminar el inventario.');
      return res.redirect('/inventarios/' + inventario.id);
    }
    await InventarioModel.deleteById(inventario.id);
    setFlash(req, 'success', 'Inventario eliminado correctamente.');
    return res.redirect('/dashboard' + (req.session.user.rol === 'admin' ? (inventario.sucursal_id ? '?sucursal_id=' + inventario.sucursal_id : '') : ''));
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

function formatDateTimeForPdf(date) {
  try {
    return new Date(date).toLocaleString('es-MX', {
      timeZone: 'America/Mexico_City',
      hour12: false
    });
  } catch (err) {
    return new Date(date).toISOString().replace('T', ' ').substring(0, 16);
  }
}

function formatQtyForPdf(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return '0';
  return num.toFixed(2).replace(/\.00$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

function formatShortDateForFileName(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[3]}${match[2]}${match[1].slice(-2)}`;
  }

  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    const fallback = new Date();
    const dd = String(fallback.getDate()).padStart(2, '0');
    const mm = String(fallback.getMonth() + 1).padStart(2, '0');
    const yy = String(fallback.getFullYear()).slice(-2);
    return `${dd}${mm}${yy}`;
  }

  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}${mm}${yy}`;
}

function normalizeTextForFileName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function buildInventoryExcelFileName(inventario) {
  const codigo = String(inventario.sucursal_codigo || inventario.sucursal_id || '')
    .trim()
    .padStart(3, '0');

  let nombre = String(inventario.sucursal_nombre || '').trim();

  if (codigo && nombre) {
    nombre = nombre
      .replace(new RegExp(`^${codigo}\\s*[-_]?\\s*`, 'i'), '')
      .trim();
  }

  const sucursalSlug = normalizeTextForFileName(
    [codigo, nombre].filter(Boolean).join('_')
  ) || `sucursal_${codigo || inventario.sucursal_id || inventario.id}`;

  const shortDate = formatShortDateForFileName(inventario.fecha || new Date());

  return `${sucursalSlug}_ci${shortDate}.xls`;
}

async function printInventario(req, res, next) {
  try {
    const inventarioId = Number(req.params.id);
    const inventario = await loadScopedInventario(req, inventarioId);

    if (!inventario) {
      setFlash(req, 'error', 'Inventario no encontrado o sin permiso.');
      return res.redirect('/dashboard');
    }

    const rows = await InventarioDetalleModel.getExportRows(inventario.id);
    const sucursalId = String(inventario.sucursal_id || '').padStart(3, '0');
    const lines = [];

    lines.push('INVENTARIO CONTADO');
    lines.push('Inventario: #' + inventario.id);
    lines.push('Fecha impresion: ' + formatDateTimeForPdf(new Date()));
    lines.push('Fecha inventario: ' + formatDateTimeForPdf(inventario.fecha));
    lines.push('Sucursal: ' + sucursalId + ' - ' + String(inventario.sucursal_nombre || ''));
    lines.push('Estado: ' + String(inventario.estado || ''));
    lines.push('Registros: ' + rows.length);
    lines.push('');
    lines.push('SKU | DESCRIPCION | CANTIDAD');

    (rows || []).forEach((row) => {
      const sku = String(row.codigo || row.barcode || '').trim();
      const descripcion = String(row.descripcion || '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 34);
      const cantidad = formatQtyForPdf(row.cantidad);
      lines.push(`${sku} | ${descripcion} | ${cantidad}`);
    });

    if (!rows.length) {
      lines.push('Sin registros capturados.');
    }

    const pdfBuffer = generateTextPdf(lines, {
      width: 300,
      fontSize: 9,
      margin: 20,
      lineHeight: 12
    });

    const fileName = `inventario_${inventario.id}_${sucursalId}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    return res.send(pdfBuffer);
  } catch (error) {
    return next(error);
  }
}

async function exportInventario(req, res, next) {
  try {
    const inventarioId = Number(req.params.inventario_id);
    const tipo = req.query.tipo === 'barcode' ? 'barcode' : 'sku';
    const inventario = await loadScopedInventario(req, inventarioId);
    if (!inventario) {
      setFlash(req, 'error', 'Inventario no encontrado o sin permiso.');
      return res.redirect('/dashboard');
    }

    const rows = await InventarioDetalleModel.getExportRows(inventario.id);
    // Prepare header row depending on the export type
    const sheetRows = [tipo === 'sku' ? ['sku', 'cantidad_contada'] : ['barcode', 'cantidad_contada']];
    // When exporting by barcode we want to fallback to the SKU if the barcode is missing,
    // because Excel and other downstream systems expect a value.  Similarly when exporting
    // by SKU we fallback to the barcode if the SKU is missing.
    rows.forEach((row) => {
      let identifier;
      if (tipo === 'sku') {
        identifier = row.codigo || row.barcode;
      } else {
        identifier = row.barcode || row.codigo;
      }
      sheetRows.push([identifier, row.cantidad]);
    });

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventario');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xls' });
    const fileName = buildInventoryExcelFileName(inventario);
    res.setHeader('Content-Type', 'application/vnd.ms-excel');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
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
  printInventario,
  exportInventario,
  deleteInventario
};
