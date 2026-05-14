# Corrección del aviso HTTP 404 en Android

El aviso `HTTP 404` después del login indica que la APK sí pudo autenticar contra la API, pero la API que está respondiendo todavía no expone el endpoint nuevo `GET /branches` que la app usa para listar sucursales y validar proforma mensual.

## Cambios aplicados

### API web

- Se mantiene la API móvil en la raíz: `/auth/login`, `/branches`, `/catalog`, etc.
- Se agregó alias bajo `/api`: `/api/auth/login`, `/api/branches`, `/api/catalog`, `/api/inventories/sync`, etc.
- Se agregó `/api/health` además de `/health`.
- Con esto la APK funciona aunque en configuración la URL base esté como `https://servidor/` o como `https://servidor/api/`.

### Android

- Si después del login `GET /branches` devuelve 404, la app ya no queda bloqueada en “Selecciona sucursal”.
- En ese caso crea una sucursal temporal desde la sucursal recibida en el login y permite iniciar inventario usando catálogo general.
- Si la API nueva sí responde `/branches`, se conserva la lógica nueva: validar proforma mensual, deshabilitar sucursales sin proforma y descargar catálogo por proforma de sucursal.
- Si `/branches/{id}/catalog` no existe en una API anterior, la app cae al catálogo general para mantener operación.
- Los inventarios creados en modo compatibilidad siguen sincronizando como antes contra la API antigua.

## Importante

La validación estricta de “no iniciar conteo sin proforma del mes” requiere que esté desplegada la API web nueva. La compatibilidad 404 es solo para que las tiendas no se queden bloqueadas si el servidor todavía tiene la API anterior.
