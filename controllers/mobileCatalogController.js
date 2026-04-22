const ProductoModel = require('../models/ProductoModel')

async function getCatalog(req, res, next) {
  try {
    const rows = await ProductoModel.listForMobileCatalog()
    return res.status(200).json(rows)
  } catch (error) {
    return next(error)
  }
}

module.exports = {
  getCatalog
}
