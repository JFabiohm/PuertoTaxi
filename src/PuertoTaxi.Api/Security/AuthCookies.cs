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

    public static void Set(HttpResponse response, AuthResponse auth)
    {
        Append(response, Access, auth.AccessToken, auth.AccessTokenExpiresAtUtc);
        Append(response, Refresh, auth.RefreshToken, auth.RefreshTokenExpiresAtUtc);
    }

    public static void Clear(HttpResponse response)
    {
        var options = BaseOptions(response);
        response.Cookies.Delete(Access, options);
        response.Cookies.Delete(Refresh, options);
    }

    private static void Append(HttpResponse response, string name, string value, DateTime expiresUtc)
    {
        var options = BaseOptions(response);
        options.MaxAge = expiresUtc > DateTime.UtcNow
            ? expiresUtc - DateTime.UtcNow
            : TimeSpan.Zero;
        response.Cookies.Append(name, value, options);
    }

    private static CookieOptions BaseOptions(HttpResponse response) => new()
    {
        HttpOnly = true,
        Secure = response.HttpContext.Request.IsHttps,
        SameSite = SameSiteMode.Lax,
        Path = "/",
        IsEssential = true
    };
}
