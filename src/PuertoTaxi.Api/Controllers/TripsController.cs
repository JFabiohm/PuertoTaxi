using System.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using PuertoTaxi.Api.Configuration;
using PuertoTaxi.Api.Contracts;
using PuertoTaxi.Api.Data;
using PuertoTaxi.Api.Domain;
using PuertoTaxi.Api.Mapping;
using PuertoTaxi.Api.Realtime;
using PuertoTaxi.Api.Security;
using PuertoTaxi.Api.Services;

namespace PuertoTaxi.Api.Controllers;

[ApiController]
[Route("api/trips")]
[Authorize]
[Produces("application/json")]
public sealed class TripsController(
    AppDbContext db,
    CurrentUser current,
    IOptions<AppOptions> appOptions,
    IRealtimeNotifier realtime,
    AuditService audit) : ControllerBase
{
    private readonly AppOptions _app = appOptions.Value;

    // ---------------------------------------------------------------- crear
    [HttpPost]
    [Authorize(Policy = Policies.PassengerOnly)]
    public async Task<ActionResult<TripDto>> Create(CreateTripRequest request, CancellationToken ct)
    {
        var passengerId = current.RequireId();

        var trip = new Trip
        {
            PassengerId = passengerId,
            Zone = request.Zone.Trim(),
            ExactAddress = request.ExactAddress.Trim(),
            PaymentMethod = request.PaymentMethod,
            HasPet = request.HasPet,
            MariaStyle = string.IsNullOrWhiteSpace(request.MariaStyle) ? "TIQUETE Y FECHA AL DIA" : request.MariaStyle.Trim(),
            UnitType = string.IsNullOrWhiteSpace(request.UnitType) ? "CUALQUIERA" : request.UnitType.Trim(),
            Status = TripStatus.Pending,
            ExpiresAtUtc = DateTime.UtcNow.AddSeconds(_app.PendingTripSeconds)
        };

        db.Trips.Add(trip);
        await db.SaveChangesAsync(ct);

        await audit.LogAsync("trip.create", "Trip", trip.Id.ToString(), ct: ct);
        await realtime.TripCreatedAsync(trip.Id, trip.Zone, ct);

        var dto = trip.ToTripDto() with { ExactAddress = trip.ExactAddress };
        return CreatedAtAction(nameof(Get), new { id = trip.Id }, dto);
    }

    // ---------------------------------------------------------------- mis viajes
    [HttpGet("me")]
    public async Task<ActionResult<IReadOnlyList<TripDto>>> Mine(CancellationToken ct, [FromQuery] int take = 50)
    {
        take = Math.Clamp(take, 1, 100);
        var me = current.RequireId();

        IQueryable<Trip> query = db.Trips.AsNoTracking()
            .Include(t => t.Passenger)
            .Include(t => t.Driver).ThenInclude(d => d!.DriverProfile);

        query = current.IsAdmin
            ? query
            : current.IsDriver
                ? query.Where(t => t.DriverId == me)
                : query.Where(t => t.PassengerId == me);

        var trips = await query
            .OrderByDescending(t => t.CreatedAtUtc)
            .Take(take)
            .ToListAsync(ct);

        return Ok(trips.Select(t => t.ToTripDto()).ToList());
    }

    // ---------------------------------------------------------------- bolsa de pendientes
    [HttpGet("available")]
    [Authorize(Policy = Policies.DriverOnly)]
    public async Task<ActionResult<IReadOnlyList<TripDto>>> Available(CancellationToken ct)
    {
        var me = current.RequireId();
        var profile = await db.DriverProfiles.AsNoTracking().SingleOrDefaultAsync(d => d.UserId == me, ct);

        // La cuenta activa ya se validó en el token; aquí basta con la aprobación.
        if (profile is null || !profile.IsApproved)
            return Problem(statusCode: 403, title: "Cuenta no aprobada");

        var now = DateTime.UtcNow;
        var trips = await db.Trips.AsNoTracking()
            .Where(t => t.Status == TripStatus.Pending
                        && t.DriverId == null
                        && t.ExpiresAtUtc > now
                        && t.PassengerId != me)
            .OrderBy(t => t.CreatedAtUtc)
            .Take(20)
            .ToListAsync(ct);

        // La dirección exacta NO se revela hasta aceptar el viaje.
        return Ok(trips.Select(t => t.ToTripDto() with
        {
            ExactAddress = "Se revela al aceptar el viaje",
            PassengerPhoneMasked = null
        }).ToList());
    }

    // ---------------------------------------------------------------- detalle
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<TripDto>> Get(Guid id, CancellationToken ct)
    {
        var trip = await LoadAsync(id, ct);
        if (trip is null) return NotFound();
        if (!CanAccess(trip)) return NotFound(); // 404 en vez de 403: no confirmamos que exista.
        return Ok(trip.ToTripDto());
    }

    // ---------------------------------------------------------------- aceptar
    [HttpPost("{id:guid}/accept")]
    [Authorize(Policy = Policies.DriverOnly)]
    public async Task<ActionResult<TripDto>> Accept(Guid id, CancellationToken ct)
    {
        var me = current.RequireId();
        var now = DateTime.UtcNow;

        // La estrategia de reintentos de SQL Server exige que las transacciones
        // manuales se ejecuten dentro de ella.
        var strategy = db.Database.CreateExecutionStrategy();

        var outcome = await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);

            // 1) Reclamo atómico del chofer (evita que tome dos viajes a la vez).
            var driverClaimed = await db.DriverProfiles
                .Where(d => d.UserId == me && d.IsApproved && d.Status == DriverStatus.Available)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(d => d.Status, DriverStatus.OnTrip)
                    .SetProperty(d => d.LastSeenUtc, now), ct);

            if (driverClaimed == 0)
            {
                await tx.RollbackAsync(ct);
                return "driver_unavailable";
            }

            // 2) Reclamo atómico del viaje.
            var claimed = await db.Trips
                .Where(t => t.Id == id
                            && t.Status == TripStatus.Pending
                            && t.DriverId == null
                            && t.ExpiresAtUtc > now
                            && t.PassengerId != me)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(t => t.DriverId, me)
                    .SetProperty(t => t.Status, TripStatus.Accepted)
                    .SetProperty(t => t.AcceptedAtUtc, now), ct);

            if (claimed == 0)
            {
                // Revertimos el estado del chofer.
                await db.DriverProfiles
                    .Where(d => d.UserId == me && d.Status == DriverStatus.OnTrip)
                    .ExecuteUpdateAsync(s => s.SetProperty(d => d.Status, DriverStatus.Available), ct);

                await tx.RollbackAsync(ct);
                return "trip_unavailable";
            }

            await tx.CommitAsync(ct);
            return "ok";
        });

        if (outcome == "driver_unavailable")
            return Problem(statusCode: 409, title: "No disponible",
                detail: "Debes estar aprobado y en estado Available para tomar un viaje.");

        if (outcome != "ok")
            return Problem(statusCode: 409, title: "Viaje no disponible",
                detail: "Otro taxista lo tomó o expiró.");

        await audit.LogAsync("trip.accept", "Trip", id.ToString(), ct: ct);

        var trip = await LoadAsync(id, ct);
        await realtime.TripUpdatedAsync(id, ct);

        return Ok(trip!.ToTripDto());
    }

    // ---------------------------------------------------------------- iniciar
    [HttpPost("{id:guid}/start")]
    [Authorize(Policy = Policies.DriverOnly)]
    public async Task<ActionResult<TripDto>> Start(Guid id, CancellationToken ct)
    {
        var me = current.RequireId();
        var now = DateTime.UtcNow;

        var rows = await db.Trips
            .Where(t => t.Id == id && t.DriverId == me && t.Status == TripStatus.Accepted)
            .ExecuteUpdateAsync(s => s
                .SetProperty(t => t.Status, TripStatus.InProgress)
                .SetProperty(t => t.StartedAtUtc, now), ct);

        if (rows == 0) return Problem(statusCode: 409, title: "Transición inválida");

        await realtime.TripUpdatedAsync(id, ct);
        return Ok((await LoadAsync(id, ct))!.ToTripDto());
    }

    // ---------------------------------------------------------------- completar
    [HttpPost("{id:guid}/complete")]
    [Authorize(Policy = Policies.DriverOnly)]
    public async Task<ActionResult<TripDto>> Complete(Guid id, CompleteTripRequest request, CancellationToken ct)
    {
        var me = current.RequireId();
        var now = DateTime.UtcNow;

        var strategy = db.Database.CreateExecutionStrategy();

        var outcome = await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);

            var rows = await db.Trips
                .Where(t => t.Id == id && t.DriverId == me && t.Status == TripStatus.InProgress)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(t => t.Status, TripStatus.Completed)
                    .SetProperty(t => t.CompletedAtUtc, now)
                    .SetProperty(t => t.Price, request.Price), ct);

            if (rows == 0)
            {
                await tx.RollbackAsync(ct);
                return "invalid";
            }

            await db.DriverProfiles
                .Where(d => d.UserId == me)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(d => d.Status, DriverStatus.Available)
                    .SetProperty(d => d.LastSeenUtc, now), ct);

            await tx.CommitAsync(ct);
            return "ok";
        });

        if (outcome != "ok")
            return Problem(statusCode: 409, title: "Transición inválida");

        await audit.LogAsync("trip.complete", "Trip", id.ToString(), ct: ct);
        await realtime.TripUpdatedAsync(id, ct);

        return Ok((await LoadAsync(id, ct))!.ToTripDto());
    }

    // ---------------------------------------------------------------- cancelar
    [HttpPost("{id:guid}/cancel")]
    public async Task<ActionResult<TripDto>> Cancel(Guid id, CancelTripRequest request, CancellationToken ct)
    {
        var me = current.RequireId();
        var reason = string.IsNullOrWhiteSpace(request.Reason)
            ? null
            : request.Reason.Trim()[..Math.Min(request.Reason.Trim().Length, 200)];

        var strategy = db.Database.CreateExecutionStrategy();
        var outcome = await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
            var trip = await LoadAsync(id, ct);

            if (trip is null || !CanAccess(trip))
            {
                await tx.RollbackAsync(ct);
                return ("not_found", trip);
            }

            if (trip.Status is TripStatus.Completed or TripStatus.Cancelled)
            {
                await tx.RollbackAsync(ct);
                return ("finished", trip);
            }

            var isPassenger = trip.PassengerId == me;
            var isDriver = trip.DriverId == me;

            // El pasajero solo puede cancelar antes de que arranque el viaje.
            if (!current.IsAdmin && !isDriver && isPassenger &&
                trip.Status is not (TripStatus.Pending or TripStatus.Accepted))
            {
                await tx.RollbackAsync(ct);
                return ("passenger_forbidden", trip);
            }

            trip.Status = TripStatus.Cancelled;
            trip.CancelledAtUtc = DateTime.UtcNow;
            trip.CancelReason = reason;

            if (trip.DriverId is not null)
            {
                await db.DriverProfiles
                    .Where(d => d.UserId == trip.DriverId && d.Status == DriverStatus.OnTrip)
                    .ExecuteUpdateAsync(s => s.SetProperty(d => d.Status, DriverStatus.Available), ct);
            }

            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return ("ok", trip);
        });

        if (outcome.Item1 == "not_found") return NotFound();
        if (outcome.Item1 == "finished")
            return Problem(statusCode: 409, title: "El viaje ya terminó");
        if (outcome.Item1 == "passenger_forbidden")
            return Problem(statusCode: 403, title: "No puedes cancelar un viaje en curso");

        await audit.LogAsync("trip.cancel", "Trip", id.ToString(), ct: ct);
        await realtime.TripUpdatedAsync(id, ct);

        return Ok((await LoadAsync(id, ct))!.ToTripDto());
    }

    // ---------------------------------------------------------------- chat
    [HttpGet("{id:guid}/messages")]
    [EnableRateLimiting("chat")]
    public async Task<ActionResult<IReadOnlyList<MessageDto>>> Messages(Guid id, CancellationToken ct)
    {
        var trip = await db.Trips.AsNoTracking().SingleOrDefaultAsync(t => t.Id == id, ct);
        if (trip is null || !CanAccess(trip)) return NotFound();

        var messages = await db.TripMessages.AsNoTracking()
            .Where(m => m.TripId == id)
            .OrderBy(m => m.CreatedAtUtc)
            .Take(200)
            .ToListAsync(ct);

        return Ok(messages.Select(m => m.ToMessageDto()).ToList());
    }

    [HttpPost("{id:guid}/messages")]
    [EnableRateLimiting("chat")]
    public async Task<ActionResult<MessageDto>> SendMessage(Guid id, SendMessageRequest request, CancellationToken ct)
    {
        var me = current.RequireId();
        var trip = await db.Trips.AsNoTracking().SingleOrDefaultAsync(t => t.Id == id, ct);

        if (trip is null || !CanAccess(trip)) return NotFound();

        if (trip.Status is not (TripStatus.Accepted or TripStatus.InProgress))
            return Problem(statusCode: 409, title: "El chat no está disponible",
                detail: "Solo se puede chatear durante un viaje activo.");

        var isPassenger = trip.PassengerId == me;
        var isDriver = trip.DriverId == me;
        if (!isPassenger && !isDriver)
            return Forbid(); // un admin no escribe en el chat del viaje

        var message = new TripMessage
        {
            TripId = id,
            SenderId = me,
            SenderRole = isDriver ? MessageSenderRole.Driver : MessageSenderRole.Passenger,
            Text = string.IsNullOrWhiteSpace(request.Text) ? null : request.Text.Trim(),
            AudioData = string.IsNullOrWhiteSpace(request.AudioData) ? null : request.AudioData
        };

        db.TripMessages.Add(message);
        await db.SaveChangesAsync(ct);

        var dto = message.ToMessageDto();
        await realtime.MessageAsync(id, dto, ct);

        return Ok(dto);
    }

    // ---------------------------------------------------------------- helpers
    private async Task<Trip?> LoadAsync(Guid id, CancellationToken ct) =>
        await db.Trips
            .Include(t => t.Passenger)
            .Include(t => t.Driver).ThenInclude(d => d!.DriverProfile)
            .SingleOrDefaultAsync(t => t.Id == id, ct);

    private bool CanAccess(Trip trip)
    {
        var me = current.RequireId();
        return current.IsAdmin || trip.PassengerId == me || trip.DriverId == me;
    }
}
