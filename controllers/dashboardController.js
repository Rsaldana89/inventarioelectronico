const InventarioModel = require('../models/InventarioModel');
const SucursalModel = require('../models/SucursalModel');
const ExistenciaCargaModel = require('../models/ExistenciaCargaModel');

async function showDashboard(req, res, next) {
  try {
    const user = req.session.user;
    const sucursales = await SucursalModel.getAll();
    const selectedSucursalId = user.rol === 'admin' ? String(req.query.sucursal_id || '') : String(user.sucursal_id || '');

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

    return res.render('dashboard', {
      title: 'Inicio',
      inventarios,
      summary,
      filters,
      sucursales,
      cargasExistencia
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { showDashboard };
