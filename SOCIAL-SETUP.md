# ROGERFILMS: visitas, likes y compartir

Implementado sobre `main` en `782b5df90007fa6143bfa3f93ff74f56353b9389` (última mejora del ojo). No se reconstruyó el sitio. El bloque se coloca después de Contacto y antes del footer, usando los colores y tipografías existentes. El código anterior, incluido el ojo, permanece intacto.

## Estado de entrega

Código preparado; **el backend todavía no está desplegado y los cambios no se subieron a GitHub**. La integración de GitHub rechazó la escritura con HTTP 403 (`Resource not accessible by integration`). Se entrega un ZIP con los archivos y un parche aplicable al repositorio; no existe una rama remota ni un pull request creado por esta entrega. `assets/social-config.js` contiene `apiUrl: ''`. Hasta configurarlo, solo aparece Compartir: nunca se muestran cifras inventadas. No existen visitas históricas recuperables; el conteo comienza al activar el servicio.

## Archivos

| Archivo | Cambio |
| --- | --- |
| `index.html` | Añade bloque social y carga sus archivos CSS/JS. |
| `assets/social.css` | Estilos aislados `rf-social`, controles de 44 px, foco visible, responsive, movimiento reducido. |
| `assets/social.js` | Compartir nativo/copia/manual, identidad anónima persistente, visitas, like reversible y actualización. |
| `assets/social-config.js` | URL pública del backend. |
| `social-backend/worker.js` | API, credenciales anónimas firmadas, límites, transacciones SQLite y limpieza. |
| `social-backend/wrangler.toml` | Worker, origen permitido, binding SQLite y migración inicial. |
| `social-backend/package.json`, `package-lock.json` | Herramientas de despliegue con versiones resueltas. |
| `social-backend/test/social.test.js` | Pruebas de persistencia, duplicados, concurrencia, autenticación y límites. |
| `.gitignore` | Excluye dependencias, datos locales y secretos. |
| `SOCIAL-SETUP.md` | Esta guía. |

## Servicio y costos

Cloudflare Workers + un Durable Object respaldado por SQLite. Un solo despliegue crea el backend y su almacenamiento; no necesitas PHP, un VPS, D1 ni cambiar DNS o GitHub Pages.

El plan Workers Free incluye Durable Objects SQLite. Actualmente incluye 100 000 peticiones al Durable Object/día, 100 000 filas escritas/día y 5 GB de almacenamiento total; los límites del Worker también aplican. La limpieza y los límites consumen escrituras, así que esas cifras **no equivalen a visitantes disponibles**. Vigila el uso en Cloudflare. Al superar el nivel gratuito se producen errores de servicio; no hay garantía de capacidad ilimitada.

Referencia: https://developers.cloudflare.com/durable-objects/platform/pricing/

## Activación exacta en Windows, macOS o Linux

1. Crea una cuenta en https://dash.cloudflare.com/sign-up y utiliza Workers Free. No hace falta transferir tu dominio. Instala Node.js 24 LTS y Git si no los tienes.
2. Descomprime `rogerfilms-social.zip`. El ZIP contiene los archivos modificados y `social-interactions.patch`. Clona el repositorio si no lo tienes: `git clone https://github.com/Rogerfilmshn/Rogerfilmshn.git`. Desde la carpeta de tu repositorio, con tus otros cambios ya guardados en un commit, ejecuta:

   ```sh
   git fetch origin
   git switch main
   git pull --ff-only
   git switch -c feat/social-interactions
   git apply --3way "RUTA/AL/ZIP-DESCOMPRIMIDO/social-interactions.patch"
   cd social-backend
   npm ci
   npm test
   npx wrangler login
   ```

   Sustituye `RUTA/AL/ZIP-DESCOMPRIMIDO` por la carpeta real. El parche añade solo esta integración. Si Git informa conflictos porque el sitio cambió después del commit base, resuélvelos antes de continuar conservando los cambios recientes. No sobrescribas el HTML nuevo a ciegas con el del ZIP.

   Se abrirá el navegador para autorizar tu propia cuenta de Cloudflare. Si tienes varias cuentas, selecciona la adecuada; puedes añadir su `account_id` (público, no es secreto) a `wrangler.toml` si Wrangler lo solicita.

3. Publica el Worker y su migración:

   ```sh
   npm run deploy
   ```

   Si se solicita, configura tu subdominio `workers.dev`. Anota la URL HTTPS que devuelve Wrangler: `https://rogerfilms-social.TU-SUBDOMINIO.workers.dev`. Este texto es un ejemplo, no una URL activa. El primer despliegue crea automáticamente el Durable Object y SQLite; las tablas se crean al recibir la primera petición. Antes del siguiente paso la API responde 503 y no acepta escrituras.

4. Genera un secreto **en tu propia terminal**:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   npx wrangler secret put SIGNING_SECRET
   ```

   Pega el valor generado cuando Wrangler lo pida. Guarda una copia en tu gestor de contraseñas. Nunca lo pegues en HTML, GitHub, `wrangler.toml` ni en esta conversación. Este comando lo almacena como secreto del Worker. No cambies el secreto rutinariamente: cambiarlo invalida las identidades anteriores; los totales permanecen, pero los navegadores anteriores perderían la posibilidad de retirar su like original.

5. Edita `assets/social-config.js` en la raíz del repositorio (un nivel arriba de `social-backend`):

   ```js
   window.ROGERFILMS_SOCIAL = Object.freeze({
     apiUrl: 'https://rogerfilms-social.TU-SUBDOMINIO.workers.dev'
   });
   ```

   Sustituye el ejemplo por la URL real, sin `/session`, `/visit` ni otra ruta al final. Esta URL es pública y segura para GitHub.

## Configuración y permisos

| Variable/configuración | Dónde | Valor |
| --- | --- | --- |
| `apiUrl` | `assets/social-config.js` | URL HTTPS real del Worker. Pública. |
| `ALLOWED_ORIGIN` | `social-backend/wrangler.toml` | `https://rogerfilmshn.github.io`, sin ruta ni slash final. Ya configurado. |
| `SIGNING_SECRET` | Cloudflare, con `wrangler secret put` | Secreto aleatorio de 32 bytes o más. Privado. |
| `SOCIAL` | Binding en `wrangler.toml` | Clase `SocialCounter`. Ya configurado. |
| Migración `v1` | `wrangler.toml` | `new_sqlite_classes = ["SocialCounter"]`. Ya configurada. |

SQLite solo es accesible a través del binding privado del Worker. No hay endpoint administrativo ni permisos públicos para SQL. El cliente solo puede registrar una visita o indicar `liked: true/false`; no puede escribir los totales. Las operaciones de datos usan una transacción para evitar actualizaciones perdidas. El servidor emite y verifica un token firmado anónimo. Se comprueba el origen, pero **CORS no se considera autenticación ni protección suficiente contra scripts externos**.

El token del navegador no es una clave administrativa. Se guarda en localStorage y, si no funciona, se intenta una cookie propia Secure/SameSite=Lax. Si no se puede guardar ninguna identidad persistente, no se registran visitas ni se habilita Like; compartir sigue disponible.

## Qué cuenta y protección contra abuso

- Una visita por navegador con identidad persistente en una ventana móvil de 30 minutos. Recargas/pestañas dentro de esa ventana no suman. Una nueva carga después de ella sí suma. No son personas únicas ni prueba de presencia humana.
- Un like activo por identidad, reversible. Solicitudes repetidas del mismo estado no suman. El servidor es la autoridad; el total no se calcula en localStorage.
- Totales actualizados al abrir la página, dar/quitar like, y aproximadamente cada 20 segundos mientras el bloque está visible y la pestaña está activa. Volver a la pestaña también refresca. No son WebSockets ni actualización instantánea entre equipos.
- Máximo 120 solicitudes/minuto por red, 10 identidades nuevas/hora y 60/día por red, 15 acciones de like/minuto por identidad. Una red compartida grande puede alcanzar esos límites; están centralizados en `worker.js`.
- Se usa la IP que Cloudflare entrega para generar un HMAC que cambia diariamente. La aplicación no guarda la IP original, el user-agent, ubicación ni huellas digitales. Conserva temporalmente ese identificador de red para límites; lo elimina al expirar y mediante una alarma horaria. Los proveedores siguen procesando conexiones según sus propias políticas.
- Los registros de deduplicación caducan tras 30 minutos (la limpieza sin tráfico puede tardar hasta una hora adicional). Los identificadores aleatorios de likes activos persisten para permitir retirarlos; al retirar el like se elimina ese registro. Los totales persisten.
- Borrar los datos del navegador, usar otro perfil/incógnito, otra red o automatización distribuida puede crear otra identidad. No se promete un like por persona: eso requeriría login o una verificación adicional. Los límites reducen abuso casual, no sustituyen un sistema antifraude.
- No cambies el nombre del Worker, binding, migración ni el identificador interno `rogerfilms-v1` para una actualización rutinaria, porque podrías apuntar a otro almacenamiento.

## Subir a GitHub Pages

Los cambios se entregan en el ZIP, no en una rama remota. Después de aplicar el parche, desplegar Cloudflare y editar `apiUrl`:

```sh
# Desde la raíz del repositorio
git add index.html .gitignore SOCIAL-SETUP.md assets/social-config.js assets/social.css assets/social.js social-backend
git commit -m "Agregar interacción social con backend persistente"
git push -u origin feat/social-interactions
```

En GitHub crea un pull request de `feat/social-interactions` hacia `main`, revisa el diff y usa **Merge pull request** para incorporar a `main`. Mantén la configuración actual de Pages. Espera a que el despliegue de Pages finalice correctamente en Actions y abre https://rogerfilmshn.github.io/Rogerfilmshn/ . No publiques una versión antigua de `index.html` sobre cambios más recientes. Si hay conflictos, conserva las ediciones recientes y agrega únicamente el bloque y sus enlaces de archivos.

Puedes subir el código de `social-backend` a GitHub: no contiene secretos. GitHub Pages no ejecuta ese directorio; el backend se despliega con Wrangler. Nunca subas `.dev.vars`, `.env`, `node_modules` ni `.wrangler`.

## Prueba real entre dispositivos

1. Abre la URL oficial en Android con Wi-Fi y en Windows u otro teléfono usando datos móviles. Baja al bloque antes del footer; ambos deben mostrar el mismo total tras la actualización (hasta unos 20 segundos).
2. Recarga cinco veces un navegador en menos de 30 minutos: sus recargas no deben añadir visitas. Otro navegador persistente sí debe añadir una.
3. Da Like en Android: el icono se colorea después de la confirmación del servidor. En Windows el total debe subir uno; su propio corazón seguirá vacío.
4. Recarga Android: su corazón debe seguir marcado y el total no debe subir. Toca de nuevo: se retira y el total baja también en Windows. Likes simultáneos en ambos dispositivos deben sumar exactamente dos.
5. Cierra y vuelve a abrir el navegador. Dentro de 30 minutos no suma otra visita; después sí puede hacerlo. El like persiste mientras se conserve su almacenamiento.
6. En Android/iPhone toca Compartir: debe abrir el menú del sistema con las aplicaciones disponibles. Cancelarlo no debe copiar ni mostrar error. En escritorio sin Web Share se copia el enlace; si el navegador bloquea copiar se muestra el enlace seleccionable.
7. Comprueba el ojo, menú, portafolio y cotizador en móvil y escritorio. Revisa orientación horizontal, navegación con Tab y la preferencia de movimiento reducido.
8. Prueba sin conexión: el sitio debe seguir usable y nunca indicar que un like fallido se guardó. Al recuperar conexión se actualizan los datos.
9. Para auditar, en DevTools > Network observa peticiones `session`, `visit`, `stats` y `like` al Worker. Deben responder 200; OPTIONS puede responder 204. Una visita repetida devuelve el mismo total, y `stats` nunca incrementa visitas. En Cloudflare inspecciona el Durable Object y su tabla `totals`; no edites números manualmente.

Los clics de prueba en producción serán interacciones reales. Si necesitas pruebas sin contaminar tus cifras, despliega antes un Worker de staging con otro nombre/almacenamiento. No hay botón público de reset.

## Validación realizada y límites

- Pruebas automatizadas ejecutadas con SQLite real en Node: persistencia tras reconstruir el objeto, concurrencia entre identidades, visitas duplicadas, vencimiento, likes idempotentes/reversibles, firma alterada, campos arbitrarios, origen no autorizado, límites y limpieza.
- `wrangler deploy --dry-run` completó la compilación y validó los bindings/migración de configuración. No despliega un servicio.
- Se verificó que el HTML original, sus scripts existentes y los archivos del ojo no se modificaron, salvo las inserciones sociales señaladas.
- No se ha probado todavía contra una cuenta Cloudflare desplegada ni contra dos dispositivos físicos. El emulador local no pudo arrancar por una restricción de interfaces de red del entorno. La descarga del navegador para QA visual tampoco estuvo disponible. Completa las pruebas anteriores después de desplegar; no se afirma una validación visual ni de producción que no se realizó.

Para repetir pruebas lógicas: `cd social-backend` y `npm test` con Node 24. Para verificar el bundle: `npx wrangler deploy --dry-run`.

## Si no aparece el contador

`apiUrl` vacío: falta activación. Error 503: revisa `SIGNING_SECRET`, binding, cuota y estado del Worker. Error 403: el origen no coincide (las vistas locales/preview no están autorizadas por la configuración de producción). Error 429: espera por el límite correspondiente, hasta una hora para nuevas identidades o hasta las 00:00 UTC para el límite diario. Bloqueo de almacenamiento o de red: compartir seguirá funcionando. La URL oficial usa HTTPS y permite las APIs de compartir/portapapeles donde el navegador las soporte.

Referencias oficiales: https://developers.cloudflare.com/durable-objects/get-started/ , https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/ , https://developers.cloudflare.com/workers/configuration/secrets/ .
