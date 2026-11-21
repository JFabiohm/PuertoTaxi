using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PuertoTaxi.Api.Contracts;
using PuertoTaxi.Api.Data;
using PuertoTaxi.Api.Domain;
using PuertoTaxi.Api.Mapping;
using PuertoTaxi.Api.Realtime;
using PuertoTaxi.Api.Security;
using PuertoTaxi.Api.Services;

namespace PuertoTaxi.Api.Controllers;

[ApiController]
[Route("api/emergency")]
[Authorize]
[Produces("application/json")]
public sealed class EmergencyController(
    AppDbContext db,
    CurrentUser current,
    IRealtimeNotifier realtime,
    IWhatsAppSender whatsapp,
    AuditService audit,
    ILogger<EmergencyController> logger) : ControllerBase
{
    [HttpPost("passenger")]
    [Authorize(Policy = Policies.PassengerOnly)]
    public async Task<IActionResult> Passenger(PassengerEmergencyRequest request, CancellationToken ct)
    {
        // Sin canal configurado no podemos afirmar que la central recibió el aviso.
        if (!whatsapp.IsConfigured)
        {
            logger.LogError("Emergencia de pasajero sin canal de WhatsApp configurado.");
            return Problem(statusCode: 503, title: "Emergencia no disponible",
                detail: "El canal de emergencia no está configurado. Llama al 9-1-1.");
        }

        await whatsapp.SendPassengerEmergencyAsync(
            request.Description.Trim(), request.Latitude, request.Longitude, ct);

        await audit.LogAsync("passenger.emergency.whatsapp", "Passenger", current.RequireId().ToString(), ct: ct);
        return Ok(new { sent = true });
    }

    /// <summary>Botón de pánico (10-33). Solo un chofer puede dispararlo.</summary>
    [HttpPost]
    [Authorize(Policy = Policies.DriverOnly)]
    public async Task<ActionResult<EmergencyDto>> Trigger(CreateEmergencyRequest request, CancellationToken ct)
    {
        var me = current.RequireId();

        // Idempotente: si ya hay una alerta activa de este chofer, devolvemos esa.
        var existing = await db.EmergencyAlerts
            .Include(a => a.Driver).ThenInclude(d => d.DriverProfile)
            .Where(a => a.DriverId == me && a.IsActive)
            .OrderByDescending(a => a.CreatedAtUtc)
            .FirstOrDefaultAsync(ct);

        if (existing is not null)
            return Ok(existing.ToEmergencyDto());

        if (request.TripId is not null)
        {
            var ownsTrip = await db.Trips.AnyAsync(
                t => t.Id == request.TripId && t.DriverId == me &&
                     (t.Status == TripStatus.Accepted || t.Status == TripStatus.InProgress), ct);

            if (!ownsTrip)
                return Problem(statusCode: 400, title: "Viaje inválido",
                    detail: "Solo puedes asociar un viaje que estés atendiendo.");
        }

        var alert = new EmergencyAlert
        {
            DriverId = me,
            TripId = request.TripId,
            Latitude = request.Latitude,
            Longitude = request.Longitude,
            Note = request.Note?.Trim()
        };

        db.EmergencyAlerts.Add(alert);
        await db.SaveChangesAsync(ct);

        var loaded = await db.EmergencyAlerts.AsNoTracking()
            .Include(a => a.Driver).ThenInclude(d => d.DriverProfile)
            .SingleAsync(a => a.Id == alert.Id, ct);

        var emergency = loaded.ToEmergencyDto();
        await audit.LogAsync("emergency.trigger", "EmergencyAlert", alert.Id.ToString(), ct: ct);
        await realtime.EmergencyCreatedAsync(emergency, ct);

        return Ok(emergency);
    }

    [HttpGet("active")]
    [Authorize(Policy = Policies.DriverOrAdmin)]
    public async Task<ActionResult<IReadOnlyList<EmergencyDto>>> Active(CancellationToken ct)
    {
        var me = current.RequireId();

        var alerts = await db.EmergencyAlerts.AsNoTracking()
            .Include(a => a.Driver).ThenInclude(d => d.DriverProfile)
            // Un chofer solo ve sus propias alertas; la central (admin) ve todas.
            .Where(a => a.IsActive && (current.IsAdmin || a.DriverId == me))
            .OrderByDescending(a => a.CreatedAtUtc)
            .ToListAsync(ct);

        return Ok(alerts.Select(a => a.ToEmergencyDto()).ToList());
    }

    /// <summary>Apagar la alarma es exclusivo de la central (admin).</summary>
    [HttpPost("{id:guid}/resolve")]
    [Authorize(Policy = Policies.AdminOnly)]
    public async Task<IActionResult> Resolve(Guid id, ResolveEmergencyRequest request, CancellationToken ct)
    {
        var me = current.RequireId();

        var rows = await db.EmergencyAlerts
            .Where(a => a.Id == id && a.IsActive)
            .ExecuteUpdateAsync(s => s
                .SetProperty(a => a.IsActive, false)
                .SetProperty(a => a.ResolvedAtUtc, DateTime.UtcNow)
                .SetProperty(a => a.ResolvedByUserId, me)
                .SetProperty(a => a.Note, request.Note), ct);

        if (rows == 0) return NotFound();

        await audit.LogAsync("emergency.resolve", "EmergencyAlert", id.ToString(), ct: ct);
        await realtime.EmergencyResolvedAsync(id, ct);

        return NoContent();
    }
}
