# PuertoTaxi frontend

Frontend React + Vite para PuertoTaxi.

## Desarrollo local

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

La API se espera en `http://localhost:5218`. Cambia `VITE_API_URL` en `.env` si utilizas otro puerto.

## Pruebas por rol

- **Pasajero:** solicita OTP, inicia sesión, crea/consulta viajes y puede enviar una emergencia escrita con su ubicación a la central por WhatsApp.
- **Taxista:** inicia sesión con email y contraseña, cambia disponibilidad, consulta peticiones, acepta/inicia/completa viajes, actualiza ubicación y activa una emergencia.
- **Administrador:** consulta estadísticas y peticiones, ve choferes activos, crea/edita/desactiva choferes y resuelve emergencias.
- En Development, el OTP se muestra en el modal como código de desarrollo. En producción, el código se envía por WhatsApp Cloud API.

La API debe estar iniciada en otra terminal:

```powershell
dotnet run --project ..\src\PuertoTaxi.Api\PuertoTaxi.Api.csproj --launch-profile http
```

## Firebase

Rellena las variables `VITE_FIREBASE_*` del archivo `.env` con la configuración de la aplicación web de Firebase. La API actual mantiene su propia autenticación JWT/OTP; Firebase queda preparado para Hosting y servicios web.

Antes de publicar, cambia `VITE_API_URL` a la URL pública donde esté alojada la API ASP.NET Core. Firebase Hosting no ejecuta la API .NET.

```powershell
npm run build
firebase login
firebase init hosting
firebase deploy --only hosting
```

En `firebase init hosting` selecciona `dist` como directorio público y configura la aplicación como SPA. El archivo `firebase.json` ya contiene el fallback hacia `index.html`.

## Peticiones y geolocalización en tiempo real

Las peticiones pendientes permanecen disponibles durante 10 minutos por defecto. El chofer recibe el evento `TripCreated` por SignalR y actualiza automáticamente su bolsa de peticiones.

La API expone el hub autenticado en `/hubs/taxi`. El frontend usa `@microsoft/signalr` y conecta con `${VITE_API_URL}/hubs/taxi`. Cuando el chofer está en estado `Available`, el navegador envía su ubicación mediante `watchPosition`; la API la almacena y publica `DriverLocationUpdated` para los administradores y choferes conectados.

La geolocalización requiere permiso del navegador y HTTPS en producción. En desarrollo funciona con `localhost`/`127.0.0.1`. Para producción, configura `VITE_API_URL` con la URL HTTPS de la API y permite el origen del frontend en `App__AllowedOrigins`.

## WhatsApp Cloud API

El token de Meta nunca se configura en React. La API .NET envía las emergencias desde el servidor. Configura estos valores como secretos o variables de entorno de la API:

```text
WhatsApp__PhoneNumberId=<identificador del número de WhatsApp Business>
WhatsApp__AccessToken=<token permanente o de sistema de Meta>
WhatsApp__CentralPhoneNumber=<número de la central en formato internacional, sin + ni espacios>
WhatsApp__GraphApiVersion=v23.0
WhatsApp__OtpTemplateName=puertotaxi_otp
WhatsApp__OtpTemplateLanguage=es
```

En Meta Developers debes tener WhatsApp Cloud API configurada, el número empresarial habilitado y permisos para enviar mensajes. Crea y aprueba una plantilla de autenticación llamada `puertotaxi_otp` con una variable en el cuerpo para el código; si usas otro nombre o idioma, cambia `WhatsApp__OtpTemplateName` y `WhatsApp__OtpTemplateLanguage`.

El OTP se envía al teléfono del pasajero y las emergencias se envían a `WhatsApp__CentralPhoneNumber`. Las credenciales deben configurarse únicamente en el servidor, por ejemplo:

```powershell
dotnet user-secrets init --project ..\src\PuertoTaxi.Api\PuertoTaxi.Api.csproj
dotnet user-secrets set "WhatsApp:PhoneNumberId" "<phone-number-id>" --project ..\src\PuertoTaxi.Api\PuertoTaxi.Api.csproj
dotnet user-secrets set "WhatsApp:AccessToken" "<token-de-meta>" --project ..\src\PuertoTaxi.Api\PuertoTaxi.Api.csproj
dotnet user-secrets set "WhatsApp:CentralPhoneNumber" "50688889999" --project ..\src\PuertoTaxi.Api\PuertoTaxi.Api.csproj
```

## Publicación

Firebase Hosting y Netlify sirven el frontend estático (`npm run build`, directorio `dist`). Ninguno ejecuta esta API .NET ni hospeda SQL Server. Publica la API en Azure App Service, Render, Railway, Cloud Run, IIS/Somee u otro proveedor compatible con ASP.NET Core, y usa SQL Server administrado o el proveedor de base de datos correspondiente.

Después de publicar la API:

1. Define `VITE_API_URL` en las variables de entorno de Netlify o Firebase durante el build.
2. Añade la URL pública del frontend a `App__AllowedOrigins` en la API.
3. Configura `ConnectionStrings__Default`, `Jwt__Key`, las variables `WhatsApp__*` y el resto de secretos solo en el servidor.
4. Verifica `/health` y `/health/ready`, y ejecuta `npm run build` antes de publicar.

Para Firebase: `firebase init hosting`, selecciona `dist` y SPA, luego `npm run build` y `firebase deploy --only hosting`. Para Netlify: conecta el repositorio, usa `frontend` como base directory, `npm run build` como build command y `frontend/dist` como publish directory.
