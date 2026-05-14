USE inventario_retail_one;

SET SQL_SAFE_UPDATES = 0;

ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS codigo VARCHAR(10) NULL AFTER id;
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS tipo ENUM('sucursal','almacen') NOT NULL DEFAULT 'sucursal' AFTER codigo;
ALTER TABLE usuarios MODIFY COLUMN rol ENUM('admin','manager','sucursal','user') NOT NULL DEFAULT 'user';

UPDATE sucursales
SET codigo = LPAD(id, 3, '0')
WHERE (codigo IS NULL OR codigo = '')
  AND id BETWEEN 1 AND 999;

UPDATE sucursales
SET tipo = 'almacen'
WHERE nombre LIKE 'Almacen %'
   OR (codigo REGEXP '^[0-9]+$' AND CAST(codigo AS UNSIGNED) > 200);

UPDATE sucursales s
JOIN usuarios u ON u.sucursal_id = s.id
SET s.tipo = 'sucursal'
WHERE s.codigo REGEXP '^[0-9]+$'
  AND CAST(s.codigo AS UNSIGNED) BETWEEN 1 AND 200
  AND s.nombre NOT LIKE 'Almacen %';

-- Si todavía no existe el índice único, créalo manualmente una vez que no haya duplicados:
-- ALTER TABLE sucursales ADD UNIQUE KEY uk_sucursales_codigo (codigo);

SET SQL_SAFE_UPDATES = 1;
