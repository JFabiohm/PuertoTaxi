using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PuertoTaxi.Api.Contracts;
using PuertoTaxi.Api.Data;
using PuertoTaxi.Api.Domain;
using PuertoTaxi.Api.Mapping;
using PuertoTaxi.Api.Security;
using PuertoTaxi.Api.Services;

namespace PuertoTaxi.Api.Controllers;

[ApiController]
[Route("api/admin")]
[Authorize(Policy = Policies.AdminOnly)]
[Produces("application/json")]
public sealed class AdminController(
    AppDbContext db,
    IPasswordHasher<User> hasher,
    AuditService audit,
    TokenService tokens,
    ILogger<AdminController> logger) : ControllerBase
{
    [HttpGet("users")]
    public async Task<ActionResult<IReadOnlyList<AdminUserDto>>> Users(CancellationToken ct)
    {
        var users = await db.Users.AsNoTracking()
            .OrderByDescending(u => u.CreatedAtUtc)
            .Select(u => new AdminUserDto(
                u.Id, u.FullName, u.Email, u.Phone, u.Role.ToString(),
                u.IsActive, u.CreatedAtUtc, u.LastLoginAtUtc))
            .ToListAsync(ct);

        return Ok(users);
    }

    [HttpGet("passengers")]
    public async Task<ActionResult<IReadOnlyList<AdminPassengerDto>>> Passengers(CancellationToken ct)
    {
        var passengers = await db.Users.AsNoTracking()
            .Where(u => u.Role == UserRole.Passenger)
            .OrderBy(u => u.Phone)
            .Select(u => new AdminPassengerDto(
                u.Phone,
                db.Trips.Count(t => t.PassengerId == u.Id),
                db.EmergencyAlerts.Any(e => e.Trip != null && e.Trip.PassengerId == u.Id)))
            .ToListAsync(ct);

        return Ok(passengers);
    }

    // ---------------------------------------------------------------- choferes
    [HttpGet("drivers")]
    public async Task<ActionResult<IReadOnlyList<AdminDriverDto>>> Drivers(CancellationToken ct)
    {
        var drivers = await db.Users.AsNoTracking()
            .Include(u => u.DriverProfile)
            .Where(u => u.Role == UserRole.Driver)
            .OrderBy(u => u.FullName)
            .ToListAsync(ct);

        return Ok(drivers.Select(u => u.ToAdminDriverDto()).ToList());
    }

    [HttpPost("drivers")]
    public async Task<ActionResult<AdminDriverDto>> CreateDriver(CreateDriverRequest request, CancellationToken ct)
    {
        var phone = OtpService.Normalize(request.Phone);
        var email = request.Email.Trim().ToLowerInvariant();

        if (await db.Users.AnyAsync(u => u.Phone == phone, ct))
            return Problem(statusCode: 409, title: "Teléfono ya registrado");

        if (await db.Users.AnyAsync(u => u.Email == email, ct))
            return Problem(statusCode: 409, title: "Correo ya registrado");

        if (await db.DriverProfiles.AnyAsync(d => d.LicensePlate == request.LicensePlate.Trim().ToUpper(), ct))
            return Problem(statusCode: 409, title: "Placa ya registrada");

        var user = new User
        {
            Phone = phone,
            Email = email,
            FullName = request.FullName.Trim(),
            Role = UserRole.Driver,
            PhoneVerifiedAtUtc = DateTime.UtcNow,
            DriverProfile = new DriverProfile
            {
                LicensePlate = request.LicensePlate.Trim().ToUpperInvariant(),
                UnitType = request.UnitType.Trim(),
                CurrentZone = request.CurrentZone.Trim(),
                Status = DriverStatus.Offline,
                IsApproved = true
            }
        };

        user.PasswordHash = hasher.HashPassword(user, request.Password);

        db.Users.Add(user);
        await db.SaveChangesAsync(ct);

        await audit.LogAsync("admin.driver_create", "User", user.Id.ToString(), ct: ct);

        return CreatedAtAction(nameof(Drivers), new { id = user.Id }, user.ToAdminDriverDto());
    }

    [HttpPut("drivers/{id:guid}")]
    public async Task<ActionResult<AdminDriverDto>> UpdateDriver(
        Guid id, UpdateDriverRequest request, CancellationToken ct)
    {
        var user = await db.Users.Include(u => u.DriverProfile)
            .SingleOrDefaultAsync(u => u.Id == id && u.Role == UserRole.Driver, ct);

        if (user?.DriverProfile is null) return NotFound();

        if (request.Phone is not null)
        {
            var phone = OtpService.Normalize(request.Phone);
            if (await db.Users.AnyAsync(u => u.Phone == phone && u.Id != id, ct))
                return Problem(statusCode: 409, title: "Teléfono ya registrado");
            user.Phone = phone;
        }

        if (request.Email is not null)
        {
            var email = request.Email.Trim().ToLowerInvariant();
            if (await db.Users.AnyAsync(u => u.Email == email && u.Id != id, ct))
                return Problem(statusCode: 409, title: "Correo ya registrado");
            user.Email = email;
        }

        if (request.FullName is not null) user.FullName = request.FullName.Trim();
        if (request.UnitType is not null) user.DriverProfile.UnitType = request.UnitType.Trim();
        if (request.CurrentZone is not null) user.DriverProfile.CurrentZone = request.CurrentZone.Trim();
        if (request.IsApproved is not null) user.DriverProfile.IsApproved = request.IsApproved.Value;

        if (request.IsActive is not null && request.IsActive.Value != user.IsActive)
        {
            user.IsActive = request.IsActive.Value;
            if (!user.IsActive)
            {
                // Al desactivar, se corta la sesión y se libera el estado.
                user.DriverProfile.Status = DriverStatus.Offline;
                await tokens.RevokeAllForUserAsync(user.Id, ct);
            }
        }

        user.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        await audit.LogAsync("admin.driver_update", "User", user.Id.ToString(), ct: ct);
        return Ok(user.ToAdminDriverDto());
    }

    /// <summary>Borrado lógico: conserva el histórico de viajes y auditoría.</summary>
    [HttpDelete("drivers/{id:guid}")]
    public async Task<IActionResult> DeactivateDriver(Guid id, CancellationToken ct)
    {
        var user = await db.Users.Include(u => u.DriverProfile)
            .SingleOrDefaultAsync(u => u.Id == id && u.Role == UserRole.Driver, ct);

        if (user is null) return NotFound();

        user.IsActive = false;
        user.UpdatedAtUtc = DateTime.UtcNow;
        if (user.DriverProfile is not null) user.DriverProfile.Status = DriverStatus.Offline;

        await db.SaveChangesAsync(ct);
        await tokens.RevokeAllForUserAsync(user.Id, ct);
        await audit.LogAsync("admin.driver_deactivate", "User", user.Id.ToString(), ct: ct);

        return NoContent();
    }

    // ---------------------------------------------------------------- auditoría y métricas
    [HttpGet("audit")]
    public async Task<IActionResult> Audit(CancellationToken ct, [FromQuery] int take = 100)
    {
        take = Math.Clamp(take, 1, 500);

        var logs = await db.AuditLogs.AsNoTracking()
            .OrderByDescending(a => a.CreatedAtUtc)
            .Take(take)
            .Select(a => new
            {
                a.Id,
                a.ActorUserId,
                a.Action,
                a.Entity,
                a.EntityId,
                a.Ip,
                a.Detail,
                a.CreatedAtUtc
            })
            .ToListAsync(ct);

        return Ok(logs);
    }

    [HttpGet("stats")]
    public async Task<ActionResult<AdminStatsDto>> Stats(CancellationToken ct)
    {
        var passengers = await db.Users.CountAsync(u => u.Role == UserRole.Passenger && u.IsActive, ct);
        var drivers = await db.Users.CountAsync(u => u.Role == UserRole.Driver && u.IsActive, ct);
        var activeTrips = await db.Trips.CountAsync(
            t => t.Status == TripStatus.Accepted || t.Status == TripStatus.InProgress, ct);
        var pendingTrips = await db.Trips.CountAsync(
            t => t.Status == TripStatus.Pending && t.ExpiresAtUtc > DateTime.UtcNow, ct);
        var emergencies = await db.EmergencyAlerts.CountAsync(a => a.IsActive, ct);

        return Ok(new AdminStatsDto(passengers, drivers, activeTrips, pendingTrips, emergencies));
    }
}
