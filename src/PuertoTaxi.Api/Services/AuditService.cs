using PuertoTaxi.Api.Data;
using PuertoTaxi.Api.Domain;
using PuertoTaxi.Api.Security;

namespace PuertoTaxi.Api.Services;

public sealed class AuditService(AppDbContext db, CurrentUser current, ILogger<AuditService> logger)
{
    public async Task LogAsync(
        string action,
        string entity,
        string? entityId = null,
        string? detail = null,
        CancellationToken ct = default)
    {
        try
        {
            db.AuditLogs.Add(new AuditLog
            {
                ActorUserId = current.Id,
                Action = Trim(action, 60),
                Entity = Trim(entity, 40),
                EntityId = Trim(entityId, 64),
                Ip = Trim(current.Ip, 64),
                Detail = Trim(detail, 500)
            });
            await db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            // La auditoría nunca debe tumbar la operación principal.
            logger.LogError(ex, "No se pudo escribir el registro de auditoría {Action}", action);
        }
    }

    private static string? Trim(string? value, int max)
    {
        if (string.IsNullOrEmpty(value)) return value;
        var clean = new string(value.Where(c => !char.IsControl(c)).ToArray());
        return clean.Length <= max ? clean : clean[..max];
    }
}
