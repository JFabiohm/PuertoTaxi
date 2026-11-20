namespace PuertoTaxi.Api.Configuration;

public sealed class JwtOptions
{
    public const string SectionName = "Jwt";

    public string Key { get; set; } = string.Empty;
    public string Issuer { get; set; } = "puertotaxi-api";
    public string Audience { get; set; } = "puertotaxi-app";
    public int AccessTokenMinutes { get; set; } = 60;
    public int RefreshTokenDays { get; set; } = 30;

    public void Validate()
    {
        if (string.IsNullOrWhiteSpace(Key) || Key.Length < 32)
            throw new InvalidOperationException(
                "Jwt:Key no está configurada o es demasiado corta (mínimo 32 caracteres). " +
                "Configúrala con 'dotnet user-secrets' o una variable de entorno.");
        if (AccessTokenMinutes is < 5 or > 1440)
            throw new InvalidOperationException("Jwt:AccessTokenMinutes debe estar entre 5 y 1440.");
    }
}

public sealed class OtpOptions
{
    public const string SectionName = "Otp";

    public int TtlMinutes { get; set; } = 5;
    public int MaxAttempts { get; set; } = 5;
    public int CooldownSeconds { get; set; } = 60;
    public int MaxPerDay { get; set; } = 10;
}

public sealed class SeedOptions
{
    public const string SectionName = "Seed";

    public string AdminEmail { get; set; } = "admin@puertotaxi.local";
    public string AdminPhone { get; set; } = "50600000000";
    public string AdminPassword { get; set; } = string.Empty;
    public bool DemoData { get; set; }
}

public sealed class AppOptions
{
    public const string SectionName = "App";

    /// <summary>Segundos que un viaje queda en la bolsa de pendientes antes de expirar.</summary>
    public int PendingTripSeconds { get; set; } = 15;

    /// <summary>Orígenes permitidos para CORS (separados por coma).</summary>
    public string AllowedOrigins { get; set; } = "";

    /// <summary>Máximo de peticiones por minuto y por IP en endpoints generales.</summary>
    public int GlobalRateLimitPerMinute { get; set; } = 120;

    /// <summary>Horas que se conservan los mensajes de chat antes de purgarse.</summary>
    public int ChatRetentionHours { get; set; } = 24;

    public int AuthRateLimitPerMinute { get; set; } = 5;
    public int OtpRateLimitPerMinute { get; set; } = 4;
    public int ChatRateLimitPerMinute { get; set; } = 40;
}

public sealed class ProxyOptions
{
    public const string SectionName = "Proxy";

    public bool Enabled { get; set; }
    public string[] KnownProxies { get; set; } = [];
}

public sealed class WhatsAppOptions
{
    public const string SectionName = "WhatsApp";

    public string PhoneNumberId { get; set; } = string.Empty;
    public string AccessToken { get; set; } = string.Empty;
    public string CentralPhoneNumber { get; set; } = string.Empty;
    public string GraphApiVersion { get; set; } = "v23.0";
    public string OtpTemplateName { get; set; } = "puertotaxi_otp";
    public string OtpTemplateLanguage { get; set; } = "es";

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(PhoneNumberId) &&
        !string.IsNullOrWhiteSpace(AccessToken) &&
        !string.IsNullOrWhiteSpace(CentralPhoneNumber);

    public bool IsOtpConfigured =>
        !string.IsNullOrWhiteSpace(PhoneNumberId) &&
        !string.IsNullOrWhiteSpace(AccessToken);
}
