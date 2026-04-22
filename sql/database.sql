CREATE DATABASE IF NOT EXISTS inventario_retail_one
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE inventario_retail_one;

CREATE TABLE IF NOT EXISTS sucursales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  rol ENUM('admin', 'sucursal') NOT NULL DEFAULT 'sucursal',
  sucursal_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_usuarios_sucursal
    FOREIGN KEY (sucursal_id) REFERENCES sucursales(id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS productos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(50) NOT NULL UNIQUE,
  barcode VARCHAR(50) NULL,
  descripcion VARCHAR(255) NOT NULL,
  familia VARCHAR(150) NULL,
  precio_menudeo DECIMAL(12,2) NULL,
  precio_mayoreo DECIMAL(12,2) NULL,
  precio_residencial DECIMAL(12,2) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_productos_barcode (barcode)
);

CREATE TABLE IF NOT EXISTS existencias_cargas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sucursal_id INT NOT NULL,
  fecha_existencia DATE NOT NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_existencias_cargas_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursales(id) ON DELETE CASCADE,
  CONSTRAINT fk_existencias_cargas_usuario FOREIGN KEY (created_by) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_existencias_cargas_sucursal_fecha (sucursal_id, fecha_existencia)
);

CREATE TABLE IF NOT EXISTS inventarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sucursal_id INT NOT NULL,
  fecha DATE NOT NULL,
  estado ENUM('abierto', 'cerrado') NOT NULL DEFAULT 'abierto',
  created_by INT NULL,
  origen_existencias ENUM('sin_existencias', 'con_existencia') NOT NULL DEFAULT 'sin_existencias',
  existencia_carga_id INT NULL,
  external_id VARCHAR(100) NULL,
  nombre VARCHAR(150) NULL,
  origen ENUM('web', 'mobile') NOT NULL DEFAULT 'web',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_inventarios_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursales(id) ON DELETE CASCADE,
  CONSTRAINT fk_inventarios_usuario FOREIGN KEY (created_by) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_inventarios_existencia_carga FOREIGN KEY (existencia_carga_id) REFERENCES existencias_cargas(id) ON DELETE SET NULL,
  UNIQUE KEY uk_inventarios_external_id (external_id),
  INDEX idx_inventarios_sucursal_fecha (sucursal_id, fecha)
);

CREATE TABLE IF NOT EXISTS inventario_detalle (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inventario_id INT NOT NULL,
  barcode VARCHAR(50) NOT NULL,
  cantidad DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_inventario_detalle_inventario FOREIGN KEY (inventario_id) REFERENCES inventarios(id) ON DELETE CASCADE,
  UNIQUE KEY uk_inventario_barcode (inventario_id, barcode),
  INDEX idx_inventario_detalle_barcode (barcode)
);

CREATE TABLE IF NOT EXISTS existencias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sucursal_id INT NOT NULL,
  codigo VARCHAR(50) NULL,
  barcode VARCHAR(50) NOT NULL,
  descripcion VARCHAR(255) NULL,
  cantidad DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_existencias_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursales(id) ON DELETE CASCADE,
  UNIQUE KEY uk_existencias_sucursal_barcode (sucursal_id, barcode),
  INDEX idx_existencias_codigo (codigo)
);

CREATE TABLE IF NOT EXISTS existencias_detalle (
  id INT AUTO_INCREMENT PRIMARY KEY,
  carga_id INT NOT NULL,
  sucursal_id INT NOT NULL,
  codigo VARCHAR(50) NULL,
  barcode VARCHAR(50) NOT NULL,
  descripcion VARCHAR(255) NULL,
  cantidad DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_existencias_detalle_carga FOREIGN KEY (carga_id) REFERENCES existencias_cargas(id) ON DELETE CASCADE,
  CONSTRAINT fk_existencias_detalle_sucursal FOREIGN KEY (sucursal_id) REFERENCES sucursales(id) ON DELETE CASCADE,
  UNIQUE KEY uk_existencias_detalle_carga_barcode (carga_id, barcode),
  INDEX idx_existencias_detalle_codigo (codigo)
);

INSERT INTO sucursales (id, nombre)
VALUES
  (1, 'Plaza Naciones'),
  (2, 'Plaza del Sol'),
  (3, 'Juriquilla')
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre);

INSERT INTO usuarios (id, username, password, rol, sucursal_id)
VALUES
  (1, 'admin', 'admin123', 'admin', NULL),
  (2, 'naciones', 'naciones123', 'sucursal', 1),
  (3, 'sol', 'sol123', 'sucursal', 2)
ON DUPLICATE KEY UPDATE
  username = VALUES(username),
  password = VALUES(password),
  rol = VALUES(rol),
  sucursal_id = VALUES(sucursal_id);

-- Si ya tienes una base previa, agrega estas columnas manualmente si faltan:
ALTER TABLE inventarios ADD COLUMN IF NOT EXISTS origen_existencias ENUM('sin_existencias', 'con_existencia') NOT NULL DEFAULT 'sin_existencias';
ALTER TABLE inventarios ADD COLUMN IF NOT EXISTS existencia_carga_id INT NULL;
ALTER TABLE inventarios ADD COLUMN IF NOT EXISTS external_id VARCHAR(100) NULL;
ALTER TABLE inventarios ADD COLUMN IF NOT EXISTS nombre VARCHAR(150) NULL;
ALTER TABLE inventarios ADD COLUMN IF NOT EXISTS origen ENUM('web', 'mobile') NOT NULL DEFAULT 'web';
-- Si el indice unico no existe en una base previa, agregalo manualmente:
-- ALTER TABLE inventarios ADD UNIQUE KEY uk_inventarios_external_id (external_id);
