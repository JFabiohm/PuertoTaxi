using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using PuertoTaxi.Api.Contracts;
using PuertoTaxi.Api.Data;
using PuertoTaxi.Api.Domain;

namespace PuertoTaxi.Api.Services;

public sealed class AuthService(
    AppDbContext db,
    IPasswordHasher<User> hasher,
    TokenService tokens,
    ILogger<AuthService> logger)
{
    private const int MaxFailedAttempts = 5;
    private static readonly TimeSpan LockoutWindow = TimeSpan.FromMinutes(15);

    public async Task<(AuthResponse? Response, string? Error)> LoginAsync(
        LoginRequest request, string? ip, CancellationToken ct)
    {
        var email = request.Email.Trim().ToLowerInvariant();

        var user = await db.Users
            .Include(u => u.DriverProfile)
            .SingleOrDefaultAsync(u => u.Email == email, ct);

        // Respuesta genérica: no revelamos si el correo existe.
        if (user is null || string.IsNullOrEmpty(user.PasswordHash) || !user.IsActive)
            return (null, "invalid_credentials");

        if (user.LockoutEndUtc is not null && user.LockoutEndUtc > DateTime.UtcNow)
            return (null, "locked_out");

        var result = hasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);

        if (result == PasswordVerificationResult.Failed)
        {
            user.FailedLoginCount++;
            if (user.FailedLoginCount >= MaxFailedAttempts)
            {
                user.LockoutEndUtc = DateTime.UtcNow.Add(LockoutWindow);
                user.FailedLoginCount = 0;
                logger.LogWarning("Cuenta bloqueada por intentos fallidos: {UserId}", user.Id);
            }

            await db.SaveChangesAsync(ct);
            return (null, "invalid_credentials");
        }

        if (result == PasswordVerificationResult.SuccessRehashNeeded)
            user.PasswordHash = hasher.HashPassword(user, request.Password);

        user.FailedLoginCount = 0;
        user.LockoutEndUtc = null;

        var response = await tokens.IssueAsync(user, ip, ct);
        return (response, null);
    }
}
