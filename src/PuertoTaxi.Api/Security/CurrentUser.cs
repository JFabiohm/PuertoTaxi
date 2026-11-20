using System.Security.Claims;
using PuertoTaxi.Api.Domain;

namespace PuertoTaxi.Api.Security;

public static class AppClaims
{
    public const string UserId = "sub";
    public const string Role = "role";
    public const string Phone = "phone";
    public const string Name = "name";
}

public static class Policies
{
    public const string PassengerOnly = "PassengerOnly";
    public const string DriverOnly = "DriverOnly";
    public const string AdminOnly = "AdminOnly";
    public const string DriverOrAdmin = "DriverOrAdmin";
    public const string Authenticated = "Authenticated";
}

/// <summary>Acceso tipado al usuario autenticado. Nunca confía en datos del body para el rol.</summary>
public sealed class CurrentUser(IHttpContextAccessor accessor)
{
    public ClaimsPrincipal? Principal => accessor.HttpContext?.User;

    public bool IsAuthenticated => Principal?.Identity?.IsAuthenticated == true;

    public Guid? Id
    {
        get
        {
            var raw = Principal?.FindFirstValue(AppClaims.UserId);
            return Guid.TryParse(raw, out var id) ? id : null;
        }
    }

    public string? Role => Principal?.FindFirstValue(AppClaims.Role);

    public bool IsAdmin => Role == nameof(UserRole.Admin);
    public bool IsDriver => Role == nameof(UserRole.Driver);
    public bool IsPassenger => Role == nameof(UserRole.Passenger);

    public string? Ip => accessor.HttpContext?.Connection.RemoteIpAddress?.ToString();

    public Guid RequireId() =>
        Id ?? throw new UnauthorizedAccessException("Token sin identificador de usuario.");
}
