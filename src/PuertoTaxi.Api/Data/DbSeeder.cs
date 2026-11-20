using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using PuertoTaxi.Api.Configuration;
using PuertoTaxi.Api.Data;
using PuertoTaxi.Api.Domain;
using PuertoTaxi.Api.Services;

namespace PuertoTaxi.Api.Data;

public static class DbSeeder
{
    public static async Task SeedAsync(IServiceProvider services)
    {
        var db = services.GetRequiredService<AppDbContext>();
        var hasher = services.GetRequiredService<IPasswordHasher<User>>();
        var options = services.GetRequiredService<IOptions<SeedOptions>>().Value;
        var env = services.GetRequiredService<IHostEnvironment>();
        var logger = services.GetRequiredService<ILoggerFactory>().CreateLogger("Seed");

        // ------------------------------ admin ------------------------------
        var adminEmail = options.AdminEmail.Trim().ToLowerInvariant();

        if (!await db.Users.AnyAsync(u => u.Role == UserRole.Admin))
        {
            var password = options.AdminPassword;

            if (string.IsNullOrWhiteSpace(password))
            {
                if (env.IsProduction())
                    throw new InvalidOperationException(
                        "Seed:AdminPassword es obligatoria en producción para crear el administrador inicial.");

                password = "Admin." + Guid.NewGuid().ToString("N")[..12] + "9";
                logger.LogWarning(
                    "No se configuró Seed:AdminPassword. Se creó el admin {Email} con contraseña temporal: {Password}",
                    adminEmail, password);
            }

            var admin = new User
            {
                Email = adminEmail,
                Phone = OtpService.Normalize(options.AdminPhone),
                FullName = "Central de Radio Puerto Taxi",
                Role = UserRole.Admin,
                PhoneVerifiedAtUtc = DateTime.UtcNow
            };
            admin.PasswordHash = hasher.HashPassword(admin, password);

            db.Users.Add(admin);
            await db.SaveChangesAsync();
            logger.LogInformation("Administrador inicial creado: {Email}", adminEmail);
        }

        // ------------------------------ datos demo ------------------------------
        if (!options.DemoData || env.IsProduction())
            return;

        if (await db.Users.AnyAsync(u => u.Role == UserRole.Driver))
            return;

        var demoDrivers = new[]
        {
            (Name: "Carlos Mora", Email: "carlos@puertotaxi.test", Phone: "50688881111", Plate: "PTX-101", Zone: "Puntarenas Centro"),
            (Name: "María Jiménez", Email: "maria@puertotaxi.test", Phone: "50688882222", Plate: "PTX-202", Zone: "El Roble-Jireth")
        };

        foreach (var d in demoDrivers)
        {
            var user = new User
            {
                Email = d.Email,
                Phone = d.Phone,
                FullName = d.Name,
                Role = UserRole.Driver,
                PhoneVerifiedAtUtc = DateTime.UtcNow,
                DriverProfile = new DriverProfile
                {
                    LicensePlate = d.Plate,
                    UnitType = "SEDAN",
                    CurrentZone = d.Zone,
                    Status = DriverStatus.Available,
                    IsApproved = true,
                    AcceptsSinpe = true,
                    AcceptsPets = true
                }
            };
            user.PasswordHash = hasher.HashPassword(user, "Demo.12345");
            db.Users.Add(user);
        }

        await db.SaveChangesAsync();
        logger.LogInformation("Datos demo creados (2 choferes). Contraseña demo: Demo.12345");
    }
}
