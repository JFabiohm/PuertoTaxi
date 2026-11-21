using PuertoTaxi.Api.Contracts;

namespace PuertoTaxi.Api.Security;

/// <summary>
/// Guarda los tokens de sesión en cookies HttpOnly para que JavaScript no pueda
/// leerlos. El header X-Cookie-Auth permite al cliente web pedir una respuesta
/// sin tokens en el body; los clientes existentes siguen recibiendo AuthResponse.
/// </summary>
public static class AuthCookies
{
    public const string Access = "puertotaxi_access";
    public const string Refresh = "puertotaxi_refresh";
    public const string CookieAuthHeader = "X-Cookie-Auth";

    public static void Set(HttpResponse response, AuthResponse auth, bool secure)
    {
        Append(response, Access, auth.AccessToken, auth.AccessTokenExpiresAtUtc, secure);
        Append(response, Refresh, auth.RefreshToken, auth.RefreshTokenExpiresAtUtc, secure);
    }

    public static void Clear(HttpResponse response, bool secure)
    {
        var options = BaseOptions(secure);
        response.Cookies.Delete(Access, options);
        response.Cookies.Delete(Refresh, options);
    }

    private static void Append(HttpResponse response, string name, string value, DateTime expiresUtc, bool secure)
    {
        var options = BaseOptions(secure);
        options.MaxAge = expiresUtc > DateTime.UtcNow
            ? expiresUtc - DateTime.UtcNow
            : TimeSpan.Zero;
        response.Cookies.Append(name, value, options);
    }

    private static CookieOptions BaseOptions(bool secure) => new()
    {
        HttpOnly = true,
        // Somee no propaga X-Forwarded-Proto; en producción se fuerza Secure
        // aunque la petición interna llegue por HTTP al app pool.
        Secure = secure,
        SameSite = SameSiteMode.Lax,
        Path = "/",
        IsEssential = true
    };
}
