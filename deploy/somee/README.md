# Publicar la API en Somee

Esta carpeta deja lista la API ASP.NET Core 10 para subirla a Somee con una
base de datos MS SQL hospedada allí.

## Regla: verificar antes de publicar

**Nada se sube a producción sin pasar antes `./check.sh`.** Ese script:

1. compila la solución;
2. corre los 59 tests de integración (usa `TEST_DB_TEMPLATE` de `.env` para
   apuntar al SQL de Docker en Linux, donde no existe LocalDB);
3. genera `frontend/dist`;
4. comprueba que la API y el frontend local respondan.

`all.sh` ya llama a `check.sh` automáticamente antes de publicar. Si algo falla,
se detiene y no se sube nada.

```bash
cd deploy/somee
./check.sh     # solo verificar
./all.sh       # verificar + publicar API + preparar frontend
```

## 0. Antes de empezar

En el panel de Somee confirma:

1. **Website** creado y dominio anotado (`tusuario.somee.com`).
2. Runtime del website en **ASP.NET Core 10**. Si el panel solo ofrece hasta
   .NET 9, dímelo: puedo publicar *self-contained* con el runtime 10 incluido o
   adaptar el proyecto a `net9.0`.
3. **MS SQL Database** creada (2022 si está disponible).
4. **WebSocket** disponible en el plan si quieres SignalR en tiempo real. Si no
   lo está, SignalR caerá automáticamente a SSE/long polling.
5. **SSL** activado para el website.
6. Credenciales **FTP** del website (o usar el File Manager del panel).

## 1. Base de datos

Tienes dos opciones:

- Ejecutar `PuertoTaxi.Database.sql` en `MS SQL Databases > [tu BD] > Run scripts`.
- Dejar que la API ejecute `Database.MigrateAsync()` en el primer arranque.

La primera opción es más predecible en hosting compartido. El script es
idempotente: crea `__EFMigrationsHistory` y las tablas solo si faltan.

## 2. Configurar secretos en local

```bash
cd ~/PuertoTaxi/deploy/somee
cp production.env.example .env
nano .env
```

Rellena al menos:

- `SOMEE_HOST`: dominio del site, sin `https://`.
- `CONNECTION_STRING`: cópiala de
  `MS SQL Databases > [tu BD] > Connection details > Connection string`.
  El parser acepta `;` sin necesidad de comillas.
- `JWT_KEY`: aleatoria, mínimo 32 caracteres (mejor 48+).
- `SEED_ADMIN_PASSWORD`: contraseña del admin inicial.
- `FRONTEND_ORIGINS`: dominio público del frontend, separado por comas.

`.env` está en `.gitignore`: **no se sube a Git**. Los secretos viajan dentro
del `web.config` generado, que queda en `publish/` (también ignorado).

## 3. Generar el paquete

```bash
./publish.sh
```

El script:

- publica con `dotnet publish -c Release -r win-x86 --self-contained false`
  (el app pool de Somee es de 32 bits; con `win-x64` el arranque falla con 500.30);
- limpia `publish/` antes de publicar para no mezclar DLL de otras arquitecturas;
- inyecta `AllowedHosts` **sin** el prefijo `ASPNETCORE_`: en .NET 10 la variable
  con prefijo no sobrescribe el valor de `appsettings.json`;
- inyecta `App__RequireHttps=false` si `SOMEE_HTTPS=false` para que la API no
  redirija a un SSL que el site no tiene;
- activa `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true`;
- activa `<webSocket enabled="true" />` solo si pusiste
  `SOMEE_ENABLE_WEBSOCKET=true`.

## 4. Subir a Somee

### Opción A: FTP desde esta máquina

Rellena `SOMEE_FTP_HOST`, `SOMEE_FTP_USER`, `SOMEE_FTP_PASSWORD` (y ajusta
`SOMEE_FTP_TLS` si tu cuenta usa FTP plano) y ejecuta:

```bash
./upload.sh
```

El script usa un `netrc` temporal con permisos `600` y lo borra al terminar.
Antes de subir crea `app_offline.htm` (IIS bloquea los DLL mientras la app está
activa), limpia la carpeta remota si `SOMEE_FTP_CLEAN=true` y al final borra
`app_offline.htm` para reactivar la app. `web.config` se sube el último.

### Opción B: File Manager del panel

Sube **todo el contenido** de `deploy/somee/publish/` a la raíz del website.
No subas la carpeta `publish` en sí, sino lo que hay dentro.

## 5. Verificación

```bash
# Usa http mientras el site no tenga certificado SSL.
curl -i http://tusuario.somee.com/health
curl -i http://tusuario.somee.com/health/ready
```

Deben devolver `200` y `Healthy`. Si activas SSL en el panel, cambia a `https`
y pon `SOMEE_HTTPS=true` antes de volver a publicar.

Swagger solo está activo en Development, así que en producción `/swagger`
dará 404. Es normal.

Si hay un fallo de arranque, pon `SOMEE_STDOUT_LOG=true`, vuelve a publicar y
revisa `logs\stdout_*.log` por FTP. Acuérdate de desactivarlo después: los logs
no se rotan y el plan free tiene poco espacio.

## 6. Frontend

`./deploy-frontend.sh` escribe `frontend/.env` y genera `frontend/dist`.

Como el site de Somee no tiene SSL y Netlify sí, `VITE_API_URL` apunta al
propio origen de Netlify y `frontend/public/_redirects` proxya las peticiones:

```
/api/*   http://TaxisPuntarenas.somee.com/api/:splat   200
/hubs/*  http://TaxisPuntarenas.somee.com/hubs/:splat  200
```

Así el navegador solo habla HTTPS y no hay *mixed content*. Arrastra
`frontend/dist` a Netlify (o usa su integración con Git). Si más adelante
activas SSL en Somee, puedes poner `VITE_API_URL=https://TaxisPuntarenas.somee.com`
y quitar `_redirects`.

## Notas

- El plan gratuito inserta un banner en respuestas HTML. Las respuestas JSON de
  la API normalmente no se tocan; verifícalo con `curl /health`.
- Somee elimina sitios y bases por inactividad. La BD debe recibir consultas al
  menos una vez al mes.
- Si usas un dominio alternativo (por ejemplo `www.tuusuario.somee.com`),
  añádelo a `SOMEE_HOST` separado por `;` y ajusta `FRONTEND_ORIGINS`.
