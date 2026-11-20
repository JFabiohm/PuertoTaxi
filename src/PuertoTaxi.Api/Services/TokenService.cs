using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using PuertoTaxi.Api.Configuration;
using PuertoTaxi.Api.Contracts;
using PuertoTaxi.Api.Data;
using PuertoTaxi.Api.Domain;
using PuertoTaxi.Api.Mapping;
using PuertoTaxi.Api.Security;

namespace PuertoTaxi.Api.Services;

public sealed class TokenService(
    AppDbContext db,
    IOptions<JwtOptions> options,
    ILogger<TokenService> logger)
{
    private readonly JwtOptions _jwt = options.Value;

    public string HashRefreshToken(string raw) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw)));

    private string CreateAccessToken(User user, out DateTime expiresAtUtc)
    {
        expiresAtUtc = DateTime.UtcNow.AddMinutes(_jwt.AccessTokenMinutes);

        var claims = new List<Claim>
        {
            new(AppClaims.UserId, user.Id.ToString()),
            new(AppClaims.Role, user.Role.ToString()),
            new(AppClaims.Phone, user.Phone),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N"))
        };

        if (!string.IsNullOrWhiteSpace(user.FullName))
            claims.Add(new Claim(AppClaims.Name, user.FullName));

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwt.Key));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _jwt.Issuer,
            audience: _jwt.Audience,
            claims: claims,
            notBefore: DateTime.UtcNow,
            expires: expiresAtUtc,
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static string CreateRefreshTokenRaw() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));

    public async Task<AuthResponse> IssueAsync(User user, string? ip, CancellationToken ct)
    {
        var access = CreateAccessToken(user, out var accessExpires);
        var refreshRaw = CreateRefreshTokenRaw();
        var refreshExpires = DateTime.UtcNow.AddDays(_jwt.RefreshTokenDays);

        db.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            TokenHash = HashRefreshToken(refreshRaw),
            ExpiresAtUtc = refreshExpires,
            CreatedByIp = ip?[..Math.Min(ip.Length, 64)]
        });

        user.LastLoginAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        return new AuthResponse(access, accessExpires, refreshRaw, refreshExpires, user.ToUserDto());
    }

    /// <summary>Rotación con detección de reuso: si el token ya fue usado, se revoca toda la familia.</summary>
    public async Task<(AuthResponse? Response, string? Error)> RotateAsync(string rawToken, string? ip, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(rawToken) || rawToken.Length > 200)
            return (null, "invalid_refresh_token");

        var hash = HashRefreshToken(rawToken);
        var stored = await db.RefreshTokens
            .Include(t => t.User).ThenInclude(u => u.DriverProfile)
            .SingleOrDefaultAsync(t => t.TokenHash == hash, ct);

        if (stored is null)
            return (null, "invalid_refresh_token");

        if (stored.RevokedAtUtc is not null)
        {
            // Posible robo/reuso: matamos todos los tokens del usuario.
            logger.LogWarning("Reuso de refresh token detectado para usuario {UserId}", stored.UserId);
            await RevokeAllForUserAsync(stored.UserId, ct);
            return (null, "refresh_token_reused");
        }

        if (stored.ExpiresAtUtc <= DateTime.UtcNow)
            return (null, "refresh_token_expired");

        if (!stored.User.IsActive)
            return (null, "user_disabled");

        var newRaw = CreateRefreshTokenRaw();
        stored.RevokedAtUtc = DateTime.UtcNow;
        stored.ReplacedByTokenHash = HashRefreshToken(newRaw);

        var access = CreateAccessToken(stored.User, out var accessExpires);
        var refreshExpires = DateTime.UtcNow.AddDays(_jwt.RefreshTokenDays);

        db.RefreshTokens.Add(new RefreshToken
        {
            UserId = stored.UserId,
            TokenHash = HashRefreshToken(newRaw),
            ExpiresAtUtc = refreshExpires,
            CreatedByIp = ip?[..Math.Min(ip.Length, 64)]
        });

        await db.SaveChangesAsync(ct);

        return (new AuthResponse(
            access,
            accessExpires,
            newRaw,
            refreshExpires,
            stored.User.ToUserDto()), null);
    }

    public async Task RevokeAsync(string rawToken, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(rawToken)) return;
        var hash = HashRefreshToken(rawToken);
        var stored = await db.RefreshTokens.SingleOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (stored is null || stored.RevokedAtUtc is not null) return;

        stored.RevokedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
    }

    public async Task RevokeAllForUserAsync(Guid userId, CancellationToken ct)
    {
        await db.RefreshTokens
            .Where(t => t.UserId == userId && t.RevokedAtUtc == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAtUtc, DateTime.UtcNow), ct);
    }
}
