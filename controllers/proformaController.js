const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const db = require('../db');
const ExistenciaCargaModel = require('../models/ExistenciaCargaModel');
const ExistenciaModel = require('../models/ExistenciaModel');
const SucursalModel = require('../models/SucursalModel');
const ProductoModel = require('../models/ProductoModel');
const { parseProformaFile } = require('../utils/proformaParser');
const { isValidInventorySku, chunkArray } = require('../utils/common');
const { setFlash, isAdmin } = require('../middlewares/auth');
const { generateTextPdf } = require('../utils/pdfGenerator');

/**
 * Delete a proforma by ID.  Only administrators and managers should
 * reach this route (enforced by router middleware).  This handler
 * removes the selected carga record and any related details.  If the
 * carga does not exist the user is redirected with an error.  Upon
 * successful deletion a success message is flashed.
 */
async function deleteProforma(req, res, next) {
  try {
    const cargaId = Number(req.params.id);
    if (!cargaId) {
      setFlash(req, 'error', 'Identificador de proforma inválido.');
      return res.redirect('/proforma');
    }
    const carga = await ExistenciaCargaModel.getById(cargaId);
    if (!carga) {
      setFlash(req, 'error', 'La proforma indicada no existe.');
      return res.redirect('/proforma');
    }
    await ExistenciaCargaModel.deleteById(cargaId);
    setFlash(req, 'success', 'Proforma eliminada correctamente.');
    return res.redirect('/proforma');
  } catch (error) {
    return next(error);
  }
}

function cleanupFile(file) {
  if (file && file.path && fs.existsSync(file.path)) {
    fs.unlinkSync(file.path);
  }
}

/**
 * Display the proforma management page.  Only administrators and managers
 * should reach this handler (enforced by route middleware).  The page lists
 * all loaded proformas grouped by branch and provides a form to upload a new
 * proforma file.
 */
async function showProformas(req, res, next) {
  try {
    // Fetch proforma loads filtered by branch id and ordered so the latest
    // proforma for each branch appears first.  Only include branches with
    // numeric identifiers <= 200 as requested.  Ordering by branch id
    // ascending and then by fecha_existencia descending ensures that the
    // first occurrence of each branch is its latest proforma.
    const [rows] = await db.query(
      `
        SELECT
          ec.id,
          ec.sucursal_id,
          ec.fecha_existencia AS fecha_proforma,
          ec.created_at,
          s.codigo AS sucursal_codigo,
          s.tipo AS sucursal_tipo,
          s.nombre AS sucursal_nombre
        FROM existencias_cargas ec
        INNER JOIN sucursales s ON s.id = ec.sucursal_id
        ORDER BY
          CASE
            WHEN s.codigo REGEXP '^[0-9]+$' THEN CAST(s.codigo AS UNSIGNED)
            ELSE s.id
          END ASC,
          ec.fecha_existencia DESC,
          ec.created_at DESC,
          ec.id DESC
      `
    );

    // Mark the first proforma per branch as the latest so the view can
    // optionally hide older proformas by default.  Because the result set
    // is sorted by sucursal_id ascending and fecha_existencia descending, the
    // first encounter of a branch id is its most recent proforma.
    const seen = new Set();
    const cargas = (rows || []).map((row) => {
      const isLatest = !seen.has(row.sucursal_id);
      seen.add(row.sucursal_id);
      return { ...row, isLatest };
    });

    // Compute today's date in YYYY-MM-DD format for the date input default.
    const today = new Date().toISOString().split('T')[0];

    return res.render('proforma', {
      title: 'Proformas',
      cargas,
      today
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Display a catalog of all products currently loaded.  Each product is
 * represented only once, ordered by SKU (codigo) numerically.  The
 * resulting view lists the SKU, barcode and description for review in
 * the browser and also offers an option to download the catalog as an
 * Excel file.
 */
async function showCatalogo(req, res, next) {
  try {
    // Retrieve all products in numeric SKU order.  Use a simple query
    // instead of the listForMobileCatalog helper so we can present the
    // native fields (codigo, barcode, descripcion) without fallback logic.
    const [rows] = await db.query(
      `
        SELECT codigo, barcode, descripcion
        FROM productos
        WHERE codigo REGEXP '^[0-9]+'
        ORDER BY CAST(codigo AS UNSIGNED) ASC
      `
    );
    return res.render('catalogo', {
      title: 'Catálogo de productos',
      productos: rows || []
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Download the current product catalog as an Excel file.  The output
 * includes only the SKU (Número de artículo), CodigoBarras and
 * Descripción columns.  Only administrators or managers should reach
 * this route (enforced by route middleware).
 */
async function downloadCatalogo(req, res, next) {
  try {
    const [rows] = await db.query(
      `
        SELECT codigo, barcode, descripcion
        FROM productos
        WHERE codigo REGEXP '^[0-9]+'
        ORDER BY CAST(codigo AS UNSIGNED) ASC
      `
    );
    const sheetRows = [['Número de artículo', 'CodigoBarras', 'Descripción']];
    rows.forEach((r) => {
      const sku = String(r.codigo || '');
      const bc = r.barcode && String(r.barcode).trim() ? String(r.barcode) : sku;
      sheetRows.push([sku, bc, String(r.descripcion || '')]);
    });
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Catalogo');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xls' });
    const fileName = 'catalogo_productos.xls';
    res.setHeader('Content-Type', 'application/vnd.ms-excel');
    res.setHeader('Content-Disposition', 'attachment; filename="' + fileName + '"');
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
}

/**
 * Handle upload of a proforma Excel file.  The uploaded file may contain
 * expected stock levels for one or more branches.  For each branch found in
 * the file, a new `existencias_cargas` record is created with the provided
 * date and the products are persisted via `existencias` and
 * `existencias_detalle`.  After successfully loading the proforma, the
 * product catalog is rebuilt using the unique items across the file.
 */
async function uploadProforma(req, res, next) {
  try {
    if (!req.file) {
      setFlash(req, 'error', 'Selecciona un archivo de proforma.');
      return res.redirect('/proforma');
    }

    // The date associated with this proforma; required by the UI.
    const fechaProforma = String(req.body.fecha_proforma || '').trim();
    if (!fechaProforma) {
      setFlash(req, 'error', 'Debes indicar la fecha de la proforma.');
      return res.redirect('/proforma');
    }

    // Parse the uploaded file.
    const parsedRows = parseProformaFile(req.file.path);
    if (!parsedRows.length) {
      setFlash(req, 'error', 'El archivo no contiene datos de proforma válidos.');
      return res.redirect('/proforma');
    }

    // Group rows by sucursalId.
    const grouped = {};
    for (const row of parsedRows) {
      if (!isValidInventorySku(row.codigo)) {
        // Skip invalid SKUs entirely
        continue;
      }
      if (!grouped[row.sucursalId]) {
        grouped[row.sucursalId] = [];
      }
      grouped[row.sucursalId].push({
        codigo: row.codigo,
        barcode: row.barcode || null,
        descripcion: row.descripcion || null,
        cantidad: row.cantidad
      });
    }

    if (!Object.keys(grouped).length) {
      setFlash(req, 'error', 'La proforma no contiene SKU válidos dentro del rango 1101001 a 9905007.');
      return res.redirect('/proforma');
    }

    // Flatten distinct products across all branches for catalog rebuild.
    const productMap = new Map();
    Object.values(grouped).forEach((rows) => {
      rows.forEach((r) => {
        if (!productMap.has(r.codigo)) {
          productMap.set(r.codigo, {
            codigo: r.codigo,
            barcode: r.barcode || null,
            descripcion: r.descripcion || ''
          });
        } else {
          const existing = productMap.get(r.codigo);
          // Prefer a non-empty barcode if one is available.
          if (!existing.barcode && r.barcode) {
            existing.barcode = r.barcode;
          }
          // Prefer a non-empty description.
          if (!existing.descripcion && r.descripcion) {
            existing.descripcion = r.descripcion;
          }
        }
      });
    });

    // Load data into the database.
    const userId = req.session.user && req.session.user.id;
    let totalLoads = 0;
    for (const sucursalId of Object.keys(grouped)) {
      const rows = grouped[sucursalId];
      const numericCodigo = Number(sucursalId);
      const normalizedCodigo = String(sucursalId || '').trim().padStart(3, '0');
      const tipo = numericCodigo >= 1 && numericCodigo <= 200 ? 'sucursal' : 'almacen';
      // La proforma trae códigos de almacén. Si el código ya corresponde a una
      // sucursal real, se reutiliza. Si no existe, se crea como almacén auxiliar
      // para conservar sus existencias sin mezclarlo con usuarios de sucursal.
      const sucursal = await SucursalModel.ensureByCodigo(
        normalizedCodigo,
        'Almacen ' + numericCodigo,
        tipo
      );
      if (!sucursal || !sucursal.id) continue;
      const cargaId = await ExistenciaCargaModel.create(Number(sucursal.id), fechaProforma, userId);
      await ExistenciaModel.replaceForSucursal(Number(sucursal.id), rows, { cargaId });
      totalLoads += 1;
    }

    // Rebuild the product catalog based on the parsed products.  The replaceAll
    // function will truncate the existing catalog and insert fresh records.
    const products = Array.from(productMap.values());
    if (products.length) {
      await ProductoModel.replaceAll(products);
    } else {
      // If no products were parsed, ensure catalog is cleared.
      await ProductoModel.truncateAll();
    }

    setFlash(
      req,
      'success',
      'Proforma cargada correctamente para ' +
        totalLoads +
        ' sucursal(es). Se importaron ' +
        products.length +
        ' productos únicos.'
    );
    return res.redirect('/proforma');
  } catch (error) {
    return next(error);
  } finally {
    cleanupFile(req.file);
  }
}

/**
 * Download a specific proforma by carga ID.  The resulting Excel will
 * include the SKU, barcode, description and expected quantity for each
 * product.  Only administrators or managers should reach this route.
 */
async function downloadProforma(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).send('Identificador de proforma inválido.');
    }
    const carga = await ExistenciaCargaModel.getById(id);
    if (!carga) {
      return res.status(404).send('Proforma no encontrada.');
    }
    const sucursal = await SucursalModel.getById(carga.sucursal_id);
    if (!sucursal) {
      return res.status(404).send('Sucursal no encontrada.');
    }
    // Fetch all items for this proforma.
    const [rows] = await db.query(
      `
        SELECT codigo, barcode, descripcion, cantidad
        FROM existencias_detalle
        WHERE carga_id = ?
        ORDER BY CAST(codigo AS UNSIGNED) ASC, descripcion ASC, barcode ASC
      `,
      [id]
    );
    // Build Excel sheet.  Header includes quantity.
    const sheetRows = [['Número de artículo', 'CodigoBarras', 'Descripción', 'En stock']];
    rows.forEach((r) => {
      sheetRows.push([
        String(r.codigo || ''),
        String(r.barcode || ''),
        String(r.descripcion || ''),
        Number(r.cantidad || 0)
      ]);
    });
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Proforma');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xls' });
    // Sanitize file name: remove spaces and accents.
    const sanitize = (str) =>
      String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]/g, '');
    const fileName = `proforma_${sanitize(sucursal.nombre)}_${carga.fecha_existencia}.xls`;
    res.setHeader('Content-Type', 'application/vnd.ms-excel');
    res.setHeader('Content-Disposition', 'attachment; filename="' + fileName + '"');
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
}

/**
 * Allow a branch user to download the latest proforma for their branch.  The
 * resulting Excel contains only SKU, barcode and description columns; the
 * expected quantity is hidden to enforce a blind count.  If the branch has
 * not yet loaded a proforma, a 404 response is returned.
 */
async function downloadMyProforma(req, res, next) {
  try {
    const user = req.session.user;
    if (!user || (!user.sucursal_id && !isAdmin(user))) {
      return res.status(403).send('No autorizado.');
    }
    const sucursalId = isAdmin(user)
      ? Number(req.query.sucursal_id || 0) || null
      : Number(user.sucursal_id);
    if (!sucursalId) {
      return res.status(400).send('Sucursal no especificada.');
    }
    // Get the most recent proforma carga for this branch.
    const cargas = await ExistenciaCargaModel.listBySucursal(sucursalId);
    if (!cargas || !cargas.length) {
      return res.status(404).send('No se encontró proforma cargada para la sucursal.');
    }
    const carga = cargas[0];
    const sucursal = await SucursalModel.getById(sucursalId);
    // Fetch items but exclude quantity; fallback barcode to codigo when missing.
    const [rows] = await db.query(
      `
        SELECT codigo, barcode, descripcion
        FROM existencias_detalle
        WHERE carga_id = ?
        ORDER BY CAST(codigo AS UNSIGNED) ASC, descripcion ASC, barcode ASC
      `,
      [carga.id]
    );
    const sheetRows = [['Número de artículo', 'CodigoBarras', 'Descripción']];
    rows.forEach((r) => {
      const sku = String(r.codigo || '');
      const bc = r.barcode && String(r.barcode).trim() ? String(r.barcode) : sku;
      sheetRows.push([sku, bc, String(r.descripcion || '')]);
    });
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Proforma');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xls' });
    const sanitize = (str) =>
      String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]/g, '');
    const fileName = `proforma_${sanitize(sucursal.nombre)}_${carga.fecha_existencia}_sin_existencia.xls`;
    res.setHeader('Content-Type', 'application/vnd.ms-excel');
    res.setHeader('Content-Disposition', 'attachment; filename="' + fileName + '"');
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
}

/**
 * Generate a printable PDF for a proforma. Branch users can print their latest
 * proforma as blank ticket format. Administrators and managers can print any
 * proforma as blank ticket format or filled letter format with expected quantities.
 */
async function printProforma(req, res, next) {
  try {
    const user = req.session.user;
    if (!user) {
      return res.status(403).send('No autorizado.');
    }

    const mode = String(req.query.mode || 'empty').toLowerCase();
    const isFilled = mode === 'filled';
    let carga;
    let sucursal;

    if (isAdmin(user)) {
      const id = Number(req.params.id || req.query.id);
      if (!id) {
        return res.status(400).send('Identificador de proforma inválido.');
      }
      carga = await ExistenciaCargaModel.getById(id);
      if (!carga) {
        return res.status(404).send('Proforma no encontrada.');
      }
      sucursal = await SucursalModel.getById(carga.sucursal_id);
      if (!sucursal) {
        return res.status(404).send('Sucursal no encontrada.');
      }
    } else {
      const sucursalId = Number(user.sucursal_id);
      if (!sucursalId) {
        return res.status(400).send('Sucursal no especificada.');
      }
      const cargas = await ExistenciaCargaModel.listBySucursal(sucursalId);
      if (!cargas || !cargas.length) {
        return res.status(404).send('No se encontró proforma cargada para la sucursal.');
      }
      carga = cargas[0];
      sucursal = await SucursalModel.getById(sucursalId);
    }

    const [rows] = await db.query(
      `
        SELECT codigo, barcode, descripcion, cantidad
        FROM existencias_detalle
        WHERE carga_id = ?
        ORDER BY CAST(codigo AS UNSIGNED) ASC, descripcion ASC, barcode ASC
      `,
      [carga.id]
    );

    const formatDateTime = (date) => {
      try {
        return new Date(date).toLocaleString('es-MX', {
          timeZone: 'America/Mexico_City',
          hour12: false
        });
      } catch (err) {
        return new Date(date).toISOString().replace('T', ' ').substring(0, 16);
      }
    };

    const sucIdStr = String(sucursal.id).padStart(3, '0');
    const lines = [];
    lines.push(isFilled ? 'PROFORMA RELLENA' : 'PROFORMA VACIA');
    lines.push('Fecha impresion: ' + formatDateTime(new Date()));
    lines.push('Fecha proforma: ' + formatDateTime(carga.fecha_existencia));
    lines.push('Sucursal/Almacen: ' + sucIdStr + ' - ' + String(sucursal.nombre || ''));
    lines.push('Hoja: continua PDF');
    lines.push('');

    if (isFilled) {
      lines.push('SKU | DESCRIPCION | CANT | CODIGO BARRAS');
    } else {
      lines.push('SKU | DESCRIPCION | CANTIDAD');
    }

    (rows || []).forEach((r) => {
      const sku = String(r.codigo || '');
      const desc = String(r.descripcion || '').replace(/\s+/g, ' ').trim();
      if (isFilled) {
        const descripcion = desc.substring(0, 26);
        const qty = Number(r.cantidad || 0);
        const barcode = String(r.barcode || sku);
        lines.push(`${sku} | ${descripcion} | ${qty} | ${barcode}`);
      } else {
        const descripcion = desc.substring(0, 36);
        lines.push(`${sku} | ${descripcion} | `);
      }
    });

    const pdfOptions = isFilled
      ? { width: 612, fontSize: 9, margin: 36, lineHeight: 12 }
      : { width: 300, fontSize: 9, margin: 20, lineHeight: 12 };

    const pdfBuffer = generateTextPdf(lines, pdfOptions);
    const fileName = `proforma_${sucIdStr}_${carga.fecha_existencia}_${isFilled ? 'rellena' : 'vacia'}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    return res.send(pdfBuffer);
  } catch (error) {
    return next(error);
  }
}


module.exports = {
  showProformas,
  uploadProforma,
  downloadProforma,
  downloadMyProforma
  ,
  showCatalogo,
  downloadCatalogo,
  printProforma,
  deleteProforma
};