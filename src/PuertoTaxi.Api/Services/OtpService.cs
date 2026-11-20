using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using PuertoTaxi.Api.Configuration;
using PuertoTaxi.Api.Data;
using PuertoTaxi.Api.Domain;

namespace PuertoTaxi.Api.Services;

public sealed class OtpService(
    AppDbContext db,
    ISmsSender sms,
    IWhatsAppSender whatsapp,
    IOptions<OtpOptions> options,
    ILogger<OtpService> logger)
{
    private readonly OtpOptions _opt = options.Value;

    public static string Normalize(string? phone) =>
        new((phone ?? string.Empty).Where(char.IsDigit).ToArray());

    private static string Hash(string code, string salt) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{salt}:{code}")));

    /// <summary>Solicita un código. Devuelve el motivo del rechazo si se excedió el límite.</summary>
    public async Task<(string? Error, string? Code)> RequestAsync(string phone, CancellationToken ct)
    {
        var normalized = Normalize(phone);
        var now = DateTime.UtcNow;

        var last = await db.OtpCodes
            .Where(o => o.Phone == normalized)
            .OrderByDescending(o => o.CreatedAtUtc)
            .Select(o => (DateTime?)o.CreatedAtUtc)
            .FirstOrDefaultAsync(ct);

        if (last is not null && (now - last.Value).TotalSeconds < _opt.CooldownSeconds)
            return ("cooldown", null);

        var dayCount = await db.OtpCodes.CountAsync(
            o => o.Phone == normalized && o.CreatedAtUtc > now.AddDays(-1), ct);

        if (dayCount >= _opt.MaxPerDay)
            return ("daily_limit", null);

        // 6 dígitos criptográficamente seguros.
        var code = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
        var salt = Convert.ToHexString(RandomNumberGenerator.GetBytes(16));

        db.OtpCodes.Add(new OtpCode
        {
            Phone = normalized,
            Salt = salt,
            CodeHash = Hash(code, salt),
            ExpiresAtUtc = now.AddMinutes(_opt.TtlMinutes)
        });

        // Invalida códigos anteriores para que solo exista uno vigente.
        await db.OtpCodes
            .Where(o => o.Phone == normalized && o.ConsumedAtUtc == null && o.ExpiresAtUtc > now)
            .ExecuteUpdateAsync(s => s.SetProperty(o => o.ConsumedAtUtc, now), ct);

        await db.SaveChangesAsync(ct);

        try
        {
            if (whatsapp.IsOtpConfigured)
                await whatsapp.SendOtpAsync(normalized, code, ct);
            else
                await sms.SendAsync(normalized, $"Puerto Taxi: tu código es {code}. Vence en {_opt.TtlMinutes} minutos.", ct);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Fallo enviando SMS a {Phone}", normalized);
            return ("sms_failed", null);
        }

        return (null, code);
    }

    /// <summary>Valida el código. Devuelve el usuario (creándolo si es nuevo) o un motivo de error.</summary>
    public async Task<(User? User, string? Error)> VerifyAsync(string phone, string code, CancellationToken ct)
    {
        var normalized = Normalize(phone);
        var now = DateTime.UtcNow;

        var otp = await db.OtpCodes
            .Where(o => o.Phone == normalized && o.ConsumedAtUtc == null)
            .OrderByDescending(o => o.CreatedAtUtc)
            .FirstOrDefaultAsync(ct);

        if (otp is null)
            return (null, "no_active_code");

        if (otp.ExpiresAtUtc <= now)
        {
            otp.ConsumedAtUtc = now;
            await db.SaveChangesAsync(ct);
            return (null, "expired");
        }

        if (otp.Attempts >= _opt.MaxAttempts)
        {
            otp.ConsumedAtUtc = now;
            await db.SaveChangesAsync(ct);
            return (null, "too_many_attempts");
        }

        var expected = Encoding.UTF8.GetBytes(otp.CodeHash);
        var actual = Encoding.UTF8.GetBytes(Hash(code, otp.Salt));

        if (expected.Length != actual.Length || !CryptographicOperations.FixedTimeEquals(expected, actual))
        {
            otp.Attempts++;
            await db.SaveChangesAsync(ct);
            return (null, "invalid_code");
        }

        otp.ConsumedAtUtc = now;

        var user = await db.Users
            .Include(u => u.DriverProfile)
            .SingleOrDefaultAsync(u => u.Phone == normalized, ct);

        if (user is null)
        {
            user = new User
            {
                Phone = normalized,
                Role = UserRole.Passenger,
                PhoneVerifiedAtUtc = now
            };
            db.Users.Add(user);
        }
        else
        {
            user.PhoneVerifiedAtUtc ??= now;
            user.UpdatedAtUtc = now;
        }

        await db.SaveChangesAsync(ct);

        if (!user.IsActive)
            return (null, "user_disabled");

        return (user, null);
    }
}
