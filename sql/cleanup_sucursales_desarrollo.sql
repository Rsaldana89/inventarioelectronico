USE inventario_retail_one;

SET SQL_SAFE_UPDATES = 0;

START TRANSACTION;

DROP TEMPORARY TABLE IF EXISTS tmp_sucursales_almacen_malas;

CREATE TEMPORARY TABLE tmp_sucursales_almacen_malas AS
SELECT id
FROM sucursales
WHERE (codigo IS NULL OR codigo = '')
  AND nombre LIKE 'Almacen %';

DROP TEMPORARY TABLE IF EXISTS tmp_inventarios_almacen_malos;

CREATE TEMPORARY TABLE tmp_inventarios_almacen_malos AS
SELECT id
FROM inventarios
WHERE sucursal_id IN (
  SELECT id FROM tmp_sucursales_almacen_malas
);

DROP TEMPORARY TABLE IF EXISTS tmp_cargas_almacen_malas;

CREATE TEMPORARY TABLE tmp_cargas_almacen_malas AS
SELECT id
FROM existencias_cargas
WHERE sucursal_id IN (
  SELECT id FROM tmp_sucursales_almacen_malas
);

DELETE FROM inventario_detalle
WHERE inventario_id IN (
  SELECT id FROM tmp_inventarios_almacen_malos
);

DELETE FROM inventarios
WHERE id IN (
  SELECT id FROM tmp_inventarios_almacen_malos
);

DELETE FROM existencias_detalle
WHERE carga_id IN (
  SELECT id FROM tmp_cargas_almacen_malas
);

DELETE FROM existencias_detalle
WHERE sucursal_id IN (
  SELECT id FROM tmp_sucursales_almacen_malas
);

DELETE FROM existencias
WHERE sucursal_id IN (
  SELECT id FROM tmp_sucursales_almacen_malas
);

DELETE FROM existencias_cargas
WHERE id IN (
  SELECT id FROM tmp_cargas_almacen_malas
);

UPDATE usuarios
SET sucursal_id = NULL
WHERE sucursal_id IN (
  SELECT id FROM tmp_sucursales_almacen_malas
);

DELETE FROM sucursales
WHERE id IN (
  SELECT id FROM tmp_sucursales_almacen_malas
);

COMMIT;

SET SQL_SAFE_UPDATES = 1;
