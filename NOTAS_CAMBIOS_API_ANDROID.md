# Cambios aplicados - API web y APK Android

## API web

- Se agregaron endpoints autenticados para la app Android:
  - `GET /branches`: lista sucursales disponibles para el usuario.
  - `GET /branches/:branchId/catalog`: devuelve solo el catálogo ciego de productos de la proforma vigente de la sucursal, sin existencias esperadas.
- Login móvil ahora devuelve `branchId`, `branchCode`, `role` e `isControlUser`.
- Admin y manager pueden seleccionar sucursal por `branchId`, `branchCode` o nombre; usuarios de sucursal quedan limitados a su sucursal asignada.
- La sincronización móvil valida que exista proforma del mes para la sucursal antes de crear/actualizar conteos.
- La sincronización rechaza productos que no pertenezcan a la proforma vigente de la sucursal.
- Los inventarios móviles quedan ligados a `existencia_carga_id` y `origen_existencias = con_existencia`.
- `GET /inventories/open` acepta sucursal para admin/manager y responde metadatos de sucursal/proforma.
- La creación web de inventarios ahora exige proforma vigente del mes.
- La pantalla web de dashboard deshabilita creación de inventario cuando la sucursal no tiene proforma mensual cargada.
- Se mantiene soporte para cantidades decimales de hasta 2 posiciones.

## Android

- El flujo offline sin login crea inventarios locales con `syncEnabled = false`; no se sincronizan con la API.
- El flujo con login usa sucursal seleccionada y proforma vigente, con `syncEnabled = true` y catálogo obligatorio.
- Admin/manager pueden elegir sucursal para iniciar conteo y consultar inventarios abiertos.
- La app bloquea inicio de inventario si la sucursal no tiene proforma del mes, mostrando el mensaje de proforma no cargada.
- Al iniciar sesión se refresca el catálogo general desde `/catalog`.
- Al iniciar conteo por sucursal se reemplaza el catálogo local por el catálogo ciego de la proforma (`/branches/:branchId/catalog`).
- Las cantidades pasaron de `Int` a `Double`, con captura y exportación de hasta 2 decimales.
- El export local a Excel/CSV/TXT sigue disponible para inventarios offline y logueados.
- La sincronización periódica existente continúa usando WorkManager; los inventarios logueados se encolan para sincronizar.

## Verificación realizada

- Se ejecutó `node -c` sobre todos los archivos JavaScript del proyecto web.
- No se pudo ejecutar build Android porque el wrapper intenta descargar Gradle 8.13 desde `services.gradle.org` y el entorno no tiene internet.
