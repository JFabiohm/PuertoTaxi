using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using PuertoTaxi.Api.Contracts;
using PuertoTaxi.Api.Data;
using PuertoTaxi.Api.Security;

namespace PuertoTaxi.Api.Realtime;

[Authorize]
public sealed class TaxiHub(AppDbContext db, CurrentUser current, ILogger<TaxiHub> logger) : Hub
{
    public const string DriversGroup = "drivers";
    public const string AdminsGroup = "admins";

    public static string TripGroup(Guid tripId) => $"trip:{tripId}";

    public override async Task OnConnectedAsync()
    {
        var me = current.RequireId();

        if (current.IsAdmin) await Groups.AddToGroupAsync(Context.ConnectionId, AdminsGroup);
        if (current.IsDriver) await Groups.AddToGroupAsync(Context.ConnectionId, DriversGroup);
        await Groups.AddToGroupAsync(Context.ConnectionId, $"user:{me}");

        logger.LogInformation("SignalR conectado: {User} ({Role})", me, current.Role);
        await base.OnConnectedAsync();
    }

    /// <summary>Unirse al canal de un viaje. Solo pasajero asignado, chofer asignado o admin.</summary>
    public async Task<bool> JoinTrip(Guid tripId)
    {
        var me = current.RequireId();

        var allowed = await db.Trips.AnyAsync(t =>
            t.Id == tripId &&
            (t.PassengerId == me || t.DriverId == me || current.IsAdmin));

        if (!allowed)
        {
            logger.LogWarning("Intento de unirse a viaje ajeno {TripId} por {User}", tripId, me);
            return false;
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, TripGroup(tripId));
        return true;
    }

    public Task LeaveTrip(Guid tripId) =>
        Groups.RemoveFromGroupAsync(Context.ConnectionId, TripGroup(tripId));
}
