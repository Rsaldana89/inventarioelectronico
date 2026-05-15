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
  getCatalog,
  /**
   * Buscar un producto por identificador (código o barcode).
   *
   * Este endpoint permite a la aplicación móvil resolver un código de barras o SKU
   * ingresado manualmente para obtener los datos del producto.  Si el producto
   * no se encuentra en el catálogo, se responde con un código 404.  La
   * respuesta incluye el identificador canónico (barcode o código), el SKU y
   * el nombre del producto.
   */
  async searchProduct(req, res, next) {
    try {
      const identifier = String(req.params.identifier || '').trim()
      if (!identifier) {
        return res.status(400).json({ error: 'Identificador requerido.' })
      }
      const product = await ProductoModel.findByScan(identifier)
      if (!product) {
        return res.status(404).json({ error: 'Producto no encontrado.' })
      }
      const canonical = product.barcode || product.codigo || identifier
      return res.status(200).json({
        barcode: String(canonical || ''),
        sku: String(product.codigo || ''),
        name: String(product.descripcion || '')
      })
    } catch (error) {
      return next(error)
    }
  }
}
