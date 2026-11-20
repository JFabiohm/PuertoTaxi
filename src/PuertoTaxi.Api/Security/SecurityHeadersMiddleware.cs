namespace PuertoTaxi.Api.Security;

/// <summary>Cabeceras de seguridad para todas las respuestas. La API solo devuelve JSON.</summary>
public sealed class SecurityHeadersMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var headers = context.Response.Headers;

        headers["X-Content-Type-Options"] = "nosniff";
        headers["X-Frame-Options"] = "DENY";
        headers["Referrer-Policy"] = "no-referrer";
        headers["Permissions-Policy"] = "geolocation=(self), microphone=(self), camera=()";
        headers["Cross-Origin-Opener-Policy"] = "same-origin";
        headers["Cross-Origin-Resource-Policy"] = "same-origin";
        headers["X-Permitted-Cross-Domain-Policies"] = "none";

        // La UI de Swagger necesita inline styles/scripts.
        var path = context.Request.Path;

        if (path.StartsWithSegments("/swagger"))
        {
            // sin CSP estricta: Swagger UI usa scripts y estilos inline.
        }
        else if (path.StartsWithSegments("/api") || path.StartsWithSegments("/hubs"))
        {
            // La API solo devuelve JSON: no necesita cargar nada.
            headers["Content-Security-Policy"] =
                "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
        }
        else
        {
            // Cliente web propio (archivos estáticos): sin inline, mismo origen.
            headers["Content-Security-Policy"] =
                "default-src 'self'; script-src 'self'; style-src 'self'; " +
                "img-src 'self' data: blob:; font-src 'self'; " +
                "connect-src 'self' ws: wss:; media-src 'self' blob:; " +
                "frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
        }

        // Las respuestas de la API no deben cachearse (contienen datos personales).
        if (context.Request.Path.StartsWithSegments("/api"))
        {
            headers["Cache-Control"] = "no-store, no-cache, must-revalidate";
            headers["Pragma"] = "no-cache";
        }

        await next(context);
    }
}
