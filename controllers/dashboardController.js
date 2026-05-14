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

    const currentMonthProforma = selectedSucursalId
      ? await ExistenciaCargaModel.getCurrentMonthBySucursal(Number(selectedSucursalId))
      : null;
    const hasProformaThisMonth = Boolean(currentMonthProforma);

    return res.render('dashboard', {
      title: 'Inicio',
      inventarios,
      summary,
      filters,
      sucursales,
      cargasExistencia,
      hasProformaThisMonth,
      currentMonthProforma
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { showDashboard };
