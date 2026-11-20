using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using PuertoTaxi.Api.Configuration;
using PuertoTaxi.Api.Data;
using PuertoTaxi.Api.Domain;

namespace PuertoTaxi.Api.Services;

/// <summary>
/// Tareas periódicas del servidor (no del navegador):
///  - expira viajes pendientes que nadie tomó
///  - limpia OTPs vencidos, refresh tokens viejos y chats antiguos
/// </summary>
public sealed class MaintenanceService(
    IServiceScopeFactory scopeFactory,
    IOptions<AppOptions> options,
    ILogger<MaintenanceService> logger) : BackgroundService
{
    private readonly AppOptions _app = options.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var lastCleanup = DateTime.MinValue;

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ExpirePendingTripsAsync(stoppingToken);

                if (DateTime.UtcNow - lastCleanup > TimeSpan.FromHours(1))
                {
                    await CleanupAsync(stoppingToken);
                    lastCleanup = DateTime.UtcNow;
                }
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error en el mantenimiento periódico");
            }

            await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
        }
    }

    private async Task ExpirePendingTripsAsync(CancellationToken ct)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var now = DateTime.UtcNow;

        await db.Trips
            .Where(t => t.Status == TripStatus.Pending && t.ExpiresAtUtc != null && t.ExpiresAtUtc < now)
            .ExecuteUpdateAsync(s => s
                .SetProperty(t => t.Status, TripStatus.Cancelled)
                .SetProperty(t => t.CancelledAtUtc, now)
                .SetProperty(t => t.CancelReason, "expired"), ct);
    }

    private async Task CleanupAsync(CancellationToken ct)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var now = DateTime.UtcNow;

        var otps = await db.OtpCodes
            .Where(o => o.CreatedAtUtc < now.AddDays(-1))
            .ExecuteDeleteAsync(ct);

        var tokens = await db.RefreshTokens
            .Where(t => t.ExpiresAtUtc < now.AddDays(-7) ||
                        (t.RevokedAtUtc != null && t.RevokedAtUtc < now.AddDays(-7)))
            .ExecuteDeleteAsync(ct);

        var messages = await db.TripMessages
            .Where(m => m.CreatedAtUtc < now.AddHours(-_app.ChatRetentionHours))
            .ExecuteDeleteAsync(ct);

        if (otps + tokens + messages > 0)
            logger.LogInformation("Limpieza: {Otps} OTPs, {Tokens} refresh tokens, {Messages} mensajes",
                otps, tokens, messages);
    }
}
