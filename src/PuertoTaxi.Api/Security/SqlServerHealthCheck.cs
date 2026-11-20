using Microsoft.Extensions.Diagnostics.HealthChecks;
using PuertoTaxi.Api.Data;

namespace PuertoTaxi.Api.Security;

public sealed class SqlServerHealthCheck(AppDbContext db) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        try
        {
            return await db.Database.CanConnectAsync(cancellationToken)
                ? HealthCheckResult.Healthy()
                : HealthCheckResult.Unhealthy("No se pudo conectar con SQL Server.");
        }
        catch (Exception ex)
        {
            return HealthCheckResult.Unhealthy("No se pudo comprobar SQL Server.", ex);
        }
    }
}