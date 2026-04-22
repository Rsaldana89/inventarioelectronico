# Sistema de Inventario Multisucursal - Retail One

Sistema web simple y funcional para captura de inventarios fisicos por sucursal, importacion de existencias desde Excel y exportacion de resultados compatibles con Retail One.

## Tecnologias

- Node.js + Express
- MySQL + `mysql2/promise`
- EJS + HTML/CSS/JavaScript puro
- `multer` para archivos
- `xlsx` para Excel
- `express-session` para autenticacion simple

## Caracteristicas incluidas

- Login con sesion
- Roles `admin` y `sucursal`
- Dashboard con filtro por fecha
- Creacion de inventarios
- Captura web por barcode o codigo
- Modo **sumar** o **sobrescribir**
- Conteo ciego basado en existencias
- Edicion y eliminacion de registros
- Cierre de inventario
- Importacion de existencias desde Excel
- Importacion de inventario desde archivo
- Exportacion a XLS
- Catalogo de productos para resolver `codigo -> barcode`

## Estructura

```bash
/routes
/controllers
/models
/middlewares
/public
/views
/uploads
/sample-data
/sql
db.js
server.js
.env.example
README.md
```

## Requisitos

- Node.js 18 o superior
- MySQL 8 o superior

## Instalacion local

1. Crea la base de datos y tablas:

```sql
SOURCE sql/database.sql;
```

O bien copia el contenido de `sql/database.sql` y ejecutalo en tu cliente MySQL.

2. Copia el archivo de variables:

```bash
cp .env.example .env
```

3. Ajusta los datos de conexion en `.env`.

4. Instala dependencias:

```bash
npm install
```

5. Inicia el sistema:

```bash
npm start
```

6. Abre en tu navegador:

```bash
http://localhost:3000
```

## Credenciales iniciales

- **Admin**
  - Usuario: `admin`
  - Password: `admin123`

- **Sucursal Plaza Naciones**
  - Usuario: `naciones`
  - Password: `naciones123`

- **Sucursal Plaza del Sol**
  - Usuario: `sol`
  - Password: `sol123`

> Las contrasenas estan en texto plano por solicitud del proyecto.

## Flujo recomendado para probar inmediatamente

1. Entra con `admin / admin123`.
2. Ve a **Existencias**.
3. Carga el catalogo usando:

```bash
sample-data/ListaEtiquetas.txt
```

4. Carga las existencias usando:

```bash
sample-data/existencias.xls
```

5. Selecciona la sucursal **Plaza Naciones**.
6. Ve al **Dashboard** y crea un inventario.
7. Captura manualmente o importa un archivo.
8. Exporta el inventario con el boton **Exportar XLS**.

## Notas sobre importacion

### 1) Catalogo de productos

La pantalla **Existencias** permite importar un archivo tipo `ListaEtiquetas.txt` con columnas como:

- Codigo
- Descripcion
- Codigo de Barras
- Familia

El sistema usa este catalogo para convertir el `codigo` de Retail One al `barcode` que se guardara para inventario y exportacion.

### 2) Existencias

La importacion detecta automaticamente dos formatos:

- **Formato Retail One** tipo:
  - `EXISTENCIA`
  - `CODIGO`
  - `DESCRIPCION`

- **Formato simple**:
  - `barcode` o `codigo`
  - `cantidad`
  - `descripcion` opcional

Cuando el archivo trae solo `codigo`, el sistema intenta resolver el barcode usando el catalogo. Si no lo encuentra, usa el mismo codigo como identificador.

### 3) Inventario desde archivo

En el detalle del inventario puedes subir un archivo con:

- `barcode` + `cantidad`
- o `codigo` + `cantidad`

Tambien soporta reimportar un archivo tipo Retail One.

## Exportacion

La ruta:

```bash
GET /export/:inventario_id
```

genera un archivo `.xls` con dos columnas:

- `barcode`
- `cantidad`

Pensado para ser reutilizado en procesos Retail One.

## Rutas principales

- `POST /login`
- `GET /dashboard`
- `GET /inventarios`
- `POST /inventarios`
- `GET /inventarios/:id`
- `POST /inventario/detalle`
- `POST /upload-existencias`
- `POST /upload-productos`
- `GET /existencias`
- `GET /export/:inventario_id`

## Consideraciones de uso

- Las sesiones usan `express-session` con almacenamiento en memoria para mantener el proyecto simple.
- El sistema esta pensado para uso interno y rapido.
- Si quieres endurecer seguridad despues, el primer paso recomendado es:
  - hashear contrasenas
  - usar un store de sesion persistente
  - auditar permisos y logs

## Agregar mas sucursales o usuarios

Ejemplo rapido:

```sql
USE inventario_retail_one;

INSERT INTO sucursales (nombre) VALUES ('Sucursal Nueva');

INSERT INTO usuarios (username, password, rol, sucursal_id)
VALUES ('sucursal_nueva', '1234', 'sucursal', 4);
```

## Deploy en Railway

### Opcion recomendada

1. Sube este proyecto a GitHub.
2. Crea un proyecto nuevo en Railway.
3. Agrega un servicio **MySQL**.
4. Agrega tu repo de GitHub como servicio web.
5. Configura variables en el servicio web usando los datos del servicio MySQL:

```env
PORT=3000
NODE_ENV=production
SESSION_SECRET=una_clave_larga_y_privada

DB_HOST=${{MySQL.MYSQLHOST}}
DB_PORT=${{MySQL.MYSQLPORT}}
DB_USER=${{MySQL.MYSQLUSER}}
DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
DB_NAME=${{MySQL.MYSQLDATABASE}}
```

> Si tu servicio MySQL tiene otro nombre en Railway, reemplaza `MySQL` por el nombre real del servicio.

6. Railway deberia detectar `npm start` automaticamente. Si no lo hace, define como Start Command:

```bash
npm start
```

7. Una vez desplegado, abre una consola de MySQL y ejecuta `sql/database.sql`.

## Salud del servicio

El sistema incluye una ruta de verificacion sencilla:

```bash
GET /health
```

## Archivos de ejemplo incluidos

- `sample-data/existencias.xls`
- `sample-data/ListaEtiquetas.txt`

## Licencia

MIT

## API movil incluida (version 0.09)

Esta version agrega una API JSON para que la app Android pueda autenticarse y sincronizar contra el mismo backend web sin romper el login HTML.

### Variables nuevas para Railway

```env
JWT_SECRET=una_clave_privada_muy_larga
JWT_EXPIRES_IN_SECONDS=2592000
```

### Endpoints moviles

- `POST /auth/login`
- `GET /health`
- `GET /catalog`
- `POST /inventories/sync`

### Ejemplo de login movil

```bash
curl -X POST http://localhost:3000/auth/login   -H "Content-Type: application/json"   -d '{"username":"naciones","password":"naciones123","branch":"Plaza Naciones"}'
```

### Ejemplo de catalogo

```bash
curl http://localhost:3000/catalog   -H "Authorization: Bearer TU_TOKEN"
```

### Ejemplo de sincronizacion

```bash
curl -X POST http://localhost:3000/inventories/sync   -H "Content-Type: application/json"   -H "Authorization: Bearer TU_TOKEN"   -d '{
    "inventory": {
      "id": "uuid-local-del-telefono",
      "remoteId": null,
      "name": "Inventario Android",
      "branch": "Plaza Naciones",
      "createdBy": "naciones",
      "status": "PENDIENTE",
      "createdAt": 1713744000000,
      "updatedAt": 1713747600000
    },
    "items": [
      {
        "id": "item-1",
        "barcode": "750100000001",
        "sku": "1100001",
        "productName": "Leche Entera 1L",
        "quantity": 3,
        "isUnknown": false,
        "updatedAt": 1713747600000
      }
    ]
  }'
```

### Notas de integracion con Android

- La web sigue usando `express-session`.
- La app Android usa token Bearer firmado con `JWT_SECRET`.
- `GET /health` ahora responde `{ "ok": true, "status": "ok" }`.
- Los inventarios creados desde la app se guardan en la misma tabla `inventarios` con `origen = 'mobile'`.
- `external_id` evita duplicados cuando el telefono reintenta sincronizar.
- El backend usa un limite JSON mayor (`5mb`) para soportar cargas grandes desde la app.

