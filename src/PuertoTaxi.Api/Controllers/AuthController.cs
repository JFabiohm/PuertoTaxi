using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using PuertoTaxi.Api.Contracts;
using PuertoTaxi.Api.Security;
using PuertoTaxi.Api.Services;

namespace PuertoTaxi.Api.Controllers;

[ApiController]
[Route("api/auth")]
[Produces("application/json")]
public sealed class AuthController(
    AuthService auth,
    OtpService otp,
    TokenService tokens,
    AuditService audit,
    CurrentUser current,
    IConfiguration config,
    IHostEnvironment env,
    ILogger<AuthController> logger) : ControllerBase
{
    private bool SecureCookies => !env.IsDevelopment() && !env.IsEnvironment("Testing");

    // El cliente web pide una respuesta sin tokens: la sesión vive en cookies
    // HttpOnly. Los clientes existentes siguen recibiendo el AuthResponse completo.
    private object ToClient(AuthResponse response) =>
        Request.Headers.ContainsKey(AuthCookies.CookieAuthHeader)
            ? new { response.User, response.AccessTokenExpiresAtUtc, response.RefreshTokenExpiresAtUtc }
            : response;

    /// <summary>Login de choferes y administradores (email + contraseña).</summary>
    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest request, CancellationToken ct)
    {
        var (response, error) = await auth.LoginAsync(request, current.Ip, ct);

        if (error == "locked_out")
            return Problem(statusCode: 423, title: "Cuenta bloqueada temporalmente",
                detail: "Demasiados intentos fallidos. Intenta de nuevo en 15 minutos.");

        if (error is not null)
        {
            logger.LogInformation("Login fallido para {Email}", request.Email);
            return Problem(statusCode: 401, title: "Credenciales inválidas",
                detail: "Correo o contraseña incorrectos.");
        }

        await audit.LogAsync("auth.login", "User", response!.User.Id.ToString(), ct: ct);
        AuthCookies.Set(Response, response!, SecureCookies);
        return Ok(ToClient(response!));
    }

    /// <summary>Envía un OTP al teléfono (pasajeros).</summary>
    [HttpPost("otp/request")]
    [AllowAnonymous]
    [EnableRateLimiting("otp-request")]
    public async Task<IActionResult> RequestOtp(OtpRequestDto request, CancellationToken ct)
    {
        var (error, code) = await otp.RequestAsync(request.Phone, ct);

        if (error == "cooldown")
            return Problem(statusCode: 429, title: "Espera un momento",
                detail: "Ya se envió un código recientemente. Espera un minuto.");

        if (error == "daily_limit")
            return Problem(statusCode: 429, title: "Límite diario alcanzado",
                detail: "Se alcanzó el máximo de códigos por día para este número.");

        if (error == "sms_failed")
            return Problem(statusCode: 502, title: "No se pudo enviar el código",
                detail: "Intenta de nuevo en unos minutos.");

        // En desarrollo se usa la bandera de appsettings; en producción solo se
        // expone el código si Otp:TestMode está activo explícitamente (temporal).
        if (config.GetValue<bool>("Otp:TestMode") ||
            config.GetValue<bool>("Otp:ExposeCodeInDevelopment"))
            return Accepted(new { ok = true, devCode = code });

        // Respuesta uniforme: no revela si el número ya existe.
        return Accepted(new { ok = true });
    }

    /// <summary>Valida el OTP y devuelve tokens de pasajero.</summary>
    [HttpPost("otp/verify")]
    [AllowAnonymous]
    [EnableRateLimiting("otp-verify")]
    public async Task<IActionResult> VerifyOtp(OtpVerifyRequest request, CancellationToken ct)
    {
        var (user, error) = await otp.VerifyAsync(request.Phone, request.Code, ct);

        if (error is not null)
        {
            var (status, title) = error switch
            {
                "too_many_attempts" => (423, "Demasiados intentos"),
                "expired" => (400, "Código expirado"),
                "no_active_code" => (400, "No hay código activo"),
                _ => (400, "Código incorrecto")
            };
            return Problem(statusCode: status, title: title, detail: "Verifica el código e intenta de nuevo.");
        }

        var response = await tokens.IssueAsync(user!, current.Ip, ct);
        await audit.LogAsync("auth.otp_verify", "User", user!.Id.ToString(), ct: ct);
        AuthCookies.Set(Response, response, SecureCookies);
        return Ok(ToClient(response));
    }

    /// <summary>Rota el refresh token y entrega un nuevo access token.</summary>
    [HttpPost("refresh")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Refresh([FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] RefreshRequest? request, CancellationToken ct)
    {
        // El navegador no conoce el refresh token: lo toma de la cookie HttpOnly.
        var raw = request?.RefreshToken;
        if (string.IsNullOrWhiteSpace(raw))
            Request.Cookies.TryGetValue(AuthCookies.Refresh, out raw);

        var (response, error) = await tokens.RotateAsync(raw ?? string.Empty, current.Ip, ct);

        if (error is not null)
        {
            logger.LogWarning("Refresh rechazado: {Error}", error);
            AuthCookies.Clear(Response, SecureCookies);
            return Problem(statusCode: 401, title: "Sesión inválida",
                detail: "Inicia sesión de nuevo.");
        }

        AuthCookies.Set(Response, response!, SecureCookies);
        return Ok(ToClient(response!));
    }

    /// <summary>Revoca el refresh token actual.</summary>
    [HttpPost("logout")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Logout([FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] RefreshRequest? request, CancellationToken ct)
    {
        var raw = request?.RefreshToken;
        if (string.IsNullOrWhiteSpace(raw))
            Request.Cookies.TryGetValue(AuthCookies.Refresh, out raw);

        await tokens.RevokeAsync(raw ?? string.Empty, ct);
        AuthCookies.Clear(Response, SecureCookies);
        return NoContent();
    }
}
