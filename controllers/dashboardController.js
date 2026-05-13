const InventarioModel = require('../models/InventarioModel');
const SucursalModel = require('../models/SucursalModel');
const ExistenciaCargaModel = require('../models/ExistenciaCargaModel');

async function showDashboard(req, res, next) {
  try {
    const user = req.session.user;
    const sucursales = await SucursalModel.getAll();
    // Permitir que usuarios con rol 'admin' o 'manager' seleccionen la sucursal de forma manual.
    const isControlUser = user.rol === 'admin' || user.rol === 'manager';
    const selectedSucursalId = isControlUser ? String(req.query.sucursal_id || '') : String(user.sucursal_id || '');

    const filters = {
      fechaInicio: String(req.query.fecha_inicio || ''),
      fechaFin: String(req.query.fecha_fin || ''),
      sucursalId: selectedSucursalId
    };

    const [inventarios, summary, cargasExistencia] = await Promise.all([
      InventarioModel.listForDashboard(user, filters),
      InventarioModel.getDashboardSummary(user, filters),
      selectedSucursalId ? ExistenciaCargaModel.listBySucursal(Number(selectedSucursalId)) : Promise.resolve([])
    ]);

    // Determine whether there is a proforma loaded for the current month.  This is
    // relevant for branch users who should not create inventories without a
    // proforma of the current month.  If there is at least one carga whose
    // `fecha_existencia` falls within the same month/year as today, the
    // flag will be true.
    let hasProformaThisMonth = false;
    if (cargasExistencia && cargasExistencia.length) {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth(); // zero-based month
      for (const carga of cargasExistencia) {
        const fecha = new Date(carga.fecha_existencia);
        if (fecha.getFullYear() === currentYear && fecha.getMonth() === currentMonth) {
          hasProformaThisMonth = true;
          break;
        }
      }
    }

    return res.render('dashboard', {
      title: 'Inicio',
      inventarios,
      summary,
      filters,
      sucursales,
      cargasExistencia,
      hasProformaThisMonth
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { showDashboard };
