USE inventario_retail_one;

SET SQL_SAFE_UPDATES = 0;

ALTER TABLE usuarios
MODIFY COLUMN rol ENUM('admin','manager','sucursal','user') NOT NULL DEFAULT 'user';

ALTER TABLE sucursales
ADD COLUMN IF NOT EXISTS codigo VARCHAR(10) NULL;

UPDATE sucursales
SET codigo = LEFT(nombre, 3)
WHERE (codigo IS NULL OR codigo = '')
  AND nombre REGEXP '^[0-9]{3}';

-- Ejecutar solo cuando ya no existan codigos duplicados:
-- ALTER TABLE sucursales ADD UNIQUE KEY uk_sucursales_codigo (codigo);

SET SQL_SAFE_UPDATES = 1;
