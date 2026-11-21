using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using PuertoTaxi.Api.Data;
using PuertoTaxi.Api.Services;

namespace PuertoTaxi.Api.Tests;

/// <summary>
/// Levanta la API real (pipeline completo) contra una base SQL Server LocalDB distinta por clase de prueba.
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    public string DatabaseName { get; } = "PuertoTaxiTests_" + Guid.NewGuid().ToString("N");

    // En Linux no existe LocalDB. PUERTOTAXI_TEST_DB_TEMPLATE permite usar otro
    // SQL (p. ej. el contenedor Docker) con {db} como marcador de la base.
    public string ConnectionString
    {
        get
        {
            var template = Environment.GetEnvironmentVariable("PUERTOTAXI_TEST_DB_TEMPLATE");
            return string.IsNullOrWhiteSpace(template)
                ? $"Server=(localdb)\\MSSQLLocalDB;Database={DatabaseName};Trusted_Connection=True;" +
                  "TrustServerCertificate=True;MultipleActiveResultSets=True"
                : template.Replace("{db}", DatabaseName, StringComparison.Ordinal);
        }
    }

    // Límites altos por defecto: las pruebas no deben chocar con el rate limiting.
    public int AuthPermitLimit { get; }
    public int OtpPermitLimit { get; }
    public int GlobalPermitLimit { get; }

    public const string AdminEmail = "admin@test.local";
    public const string AdminPassword = "Admin.12345";
    public const string DriverPassword = "Chofer.12345";

    public ApiFactory() : this(10_000, 10_000, 100_000)
    {
    }

    internal ApiFactory(int authPermitLimit, int otpPermitLimit, int globalPermitLimit)
    {
        AuthPermitLimit = authPermitLimit;
        OtpPermitLimit = otpPermitLimit;
        GlobalPermitLimit = globalPermitLimit;

        // Program lee la configuración al construir el host, antes de que
        // ConfigureAppConfiguration del factory tenga efecto. Las variables de
        // entorno sí están disponibles desde el primer momento.
        Environment.SetEnvironmentVariable("App__AuthRateLimitPerMinute", authPermitLimit.ToString());
        Environment.SetEnvironmentVariable("App__OtpRateLimitPerMinute", otpPermitLimit.ToString());
        Environment.SetEnvironmentVariable("App__GlobalRateLimitPerMinute", globalPermitLimit.ToString());
        Environment.SetEnvironmentVariable("App__PendingTripSeconds", "300");
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        builder.ConfigureAppConfiguration((_, cfg) => cfg.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:Default"] = ConnectionString,
            ["Seed:AdminEmail"] = AdminEmail,
            ["Seed:AdminPhone"] = "50600000001",
            ["Seed:AdminPassword"] = AdminPassword,
            ["Seed:DemoData"] = "false",
            ["App:AllowedOrigins"] = "",
            ["App:AuthRateLimitPerMinute"] = AuthPermitLimit.ToString(),
            ["App:OtpRateLimitPerMinute"] = OtpPermitLimit.ToString(),
            ["App:GlobalRateLimitPerMinute"] = GlobalPermitLimit.ToString()
        }));

        builder.ConfigureServices(services =>
        {
            var toRemove = services
                .Where(d => d.ServiceType == typeof(DbContextOptions<AppDbContext>)
                         || d.ServiceType == typeof(DbContextOptions)
                         || d.ServiceType == typeof(AppDbContext))
                .ToList();

            foreach (var descriptor in toRemove)
                services.Remove(descriptor);

            services.AddDbContext<AppDbContext>(o => o.UseSqlServer(ConnectionString));
        });
    }

    protected override IHost CreateHost(IHostBuilder builder)
    {
        var host = base.CreateHost(builder);

        using var scope = host.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        // LocalDB a veces tarda en quedar lista justo después de crearse.
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                db.Database.Migrate();
                break;
            }
            catch (Microsoft.Data.SqlClient.SqlException) when (attempt < 6)
            {
                Thread.Sleep(750);
            }
        }

        DbSeeder.SeedAsync(scope.ServiceProvider).GetAwaiter().GetResult();

        return host;
    }

    public CapturingSmsSender Sms => Services.GetRequiredService<CapturingSmsSender>();

    public async Task<T> WithDbAsync<T>(Func<AppDbContext, Task<T>> action)
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await action(db);
    }

    public async Task WithDbAsync(Func<AppDbContext, Task> action)
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await action(db);
    }

    public override async ValueTask DisposeAsync()
    {
        try
        {
            await UsingDbDeleteAsync();
        }
        catch
        {
            // Si la base no se puede borrar (conexiones abiertas), no debe romper la prueba.
        }

        await base.DisposeAsync();
    }

    private async Task UsingDbDeleteAsync()
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.EnsureDeletedAsync();
    }
}
