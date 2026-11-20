namespace PuertoTaxi.Api.Domain;

/// <summary>
/// Cuenta única para pasajeros, choferes y administradores.
/// El teléfono es el identificador natural del pasajero; el email lo es del chofer/admin.
/// Las contraseñas SIEMPRE se guardan hasheadas (PBKDF2 vía PasswordHasher) y nunca se serializan.
/// </summary>
public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string Phone { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string? PasswordHash { get; set; }
    public string? FullName { get; set; }

    public UserRole Role { get; set; } = UserRole.Passenger;
    public bool IsActive { get; set; } = true;
    public DateTime? PhoneVerifiedAtUtc { get; set; }

    public int FailedLoginCount { get; set; }
    public DateTime? LockoutEndUtc { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? LastLoginAtUtc { get; set; }

    public DriverProfile? DriverProfile { get; set; }
}
