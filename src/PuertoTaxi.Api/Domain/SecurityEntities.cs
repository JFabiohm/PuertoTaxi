namespace PuertoTaxi.Api.Domain;

/// <summary>Código OTP de un solo uso. Se guarda HASHEADO; el código en claro nunca toca la base.</summary>
public class OtpCode
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string Phone { get; set; } = string.Empty;
    public string CodeHash { get; set; } = string.Empty;
    public string Salt { get; set; } = string.Empty;

    public int Attempts { get; set; }
    public DateTime ExpiresAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? ConsumedAtUtc { get; set; }
}

/// <summary>Refresh token rotativo. Se guarda solo el hash SHA-256.</summary>
public class RefreshToken
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public string TokenHash { get; set; } = string.Empty;
    public DateTime ExpiresAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? RevokedAtUtc { get; set; }
    public string? ReplacedByTokenHash { get; set; }
    public string? CreatedByIp { get; set; }

    public bool IsActive => RevokedAtUtc is null && ExpiresAtUtc > DateTime.UtcNow;
}

/// <summary>Bitácora de acciones sensibles (login, cambios de rol, resolución de 10-33, etc.).</summary>
public class AuditLog
{
    public long Id { get; set; }

    public Guid? ActorUserId { get; set; }
    public string Action { get; set; } = string.Empty;
    public string Entity { get; set; } = string.Empty;
    public string? EntityId { get; set; }
    public string? Ip { get; set; }
    public string? Detail { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
