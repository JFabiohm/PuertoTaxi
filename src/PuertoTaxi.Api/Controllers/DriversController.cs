using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PuertoTaxi.Api.Contracts;
using PuertoTaxi.Api.Data;
using PuertoTaxi.Api.Domain;
using PuertoTaxi.Api.Mapping;
using PuertoTaxi.Api.Realtime;
using PuertoTaxi.Api.Security;

namespace PuertoTaxi.Api.Controllers;

[ApiController]
[Route("api/drivers")]
[Produces("application/json")]
public sealed class DriversController(AppDbContext db, CurrentUser current, IRealtimeNotifier realtime) : ControllerBase
{
    /// <summary>Flota visible para choferes y central. No expone email ni teléfono.</summary>
    [HttpGet]
    [Authorize(Policy = Policies.DriverOrAdmin)]
    public async Task<ActionResult<IReadOnlyList<DriverDto>>> List(CancellationToken ct)
    {
        var drivers = await db.Users
            .AsNoTracking()
            .Include(u => u.DriverProfile)
            .Where(u => u.Role == UserRole.Driver && u.IsActive && u.DriverProfile != null && u.DriverProfile.IsApproved)
            .OrderBy(u => u.FullName)
            .ToListAsync(ct);

        return Ok(drivers.Select(u => u.DriverProfile!.ToDriverDto(u.FullName ?? string.Empty)).ToList());
    }

    [HttpGet("{id:guid}")]
    [Authorize(Policy = Policies.DriverOrAdmin)]
    public async Task<ActionResult<DriverDto>> Get(Guid id, CancellationToken ct)
    {
        var driver = await db.Users
            .AsNoTracking()
            .Include(u => u.DriverProfile)
            .SingleOrDefaultAsync(u => u.Id == id && u.Role == UserRole.Driver && u.IsActive, ct);

        if (driver?.DriverProfile is null) return NotFound();

        return Ok(driver.DriverProfile.ToDriverDto(driver.FullName ?? string.Empty));
    }

    [HttpPatch("me/location")]
    [Authorize(Policy = Policies.DriverOnly)]
    public async Task<IActionResult> UpdateLocation(UpdateLocationRequest request, CancellationToken ct)
    {
        var id = current.RequireId();
        var profile = await db.DriverProfiles.SingleOrDefaultAsync(d => d.UserId == id, ct);
        if (profile is null) return NotFound();

        profile.LastLat = request.Latitude;
        profile.LastLng = request.Longitude;
        profile.LastSeenUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        await realtime.DriverLocationUpdatedAsync(id, request.Latitude, request.Longitude, ct);

        return NoContent();
    }

    [HttpPatch("me/status")]
    [Authorize(Policy = Policies.DriverOnly)]
    public async Task<IActionResult> UpdateStatus(UpdateDriverStatusRequest request, CancellationToken ct)
    {
        var id = current.RequireId();
        var profile = await db.DriverProfiles.SingleOrDefaultAsync(d => d.UserId == id, ct);
        if (profile is null) return NotFound();

        if (!profile.IsApproved)
            return Problem(statusCode: 403, title: "Cuenta no aprobada",
                detail: "Un administrador debe aprobar tu cuenta antes de conectarte.");

        profile.Status = Enum.Parse<DriverStatus>(request.Status, ignoreCase: false);
        profile.LastSeenUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        return NoContent();
    }

    [HttpPatch("me/preferences")]
    [Authorize(Policy = Policies.DriverOnly)]
    public async Task<ActionResult<DriverDto>> UpdatePreferences(
        UpdateDriverPreferencesRequest request, CancellationToken ct)
    {
        var id = current.RequireId();
        var user = await db.Users.Include(u => u.DriverProfile)
            .SingleOrDefaultAsync(u => u.Id == id, ct);

        if (user?.DriverProfile is null) return NotFound();

        var p = user.DriverProfile;
        if (request.AcceptsSinpe is not null) p.AcceptsSinpe = request.AcceptsSinpe.Value;
        if (request.AcceptsPets is not null) p.AcceptsPets = request.AcceptsPets.Value;
        if (request.MariaStyle is not null) p.MariaStyle = request.MariaStyle.Trim();
        if (request.UnitType is not null) p.UnitType = request.UnitType.Trim();
        if (request.CurrentZone is not null) p.CurrentZone = request.CurrentZone.Trim();

        await db.SaveChangesAsync(ct);
        return Ok(p.ToDriverDto(user.FullName ?? string.Empty));
    }
}
