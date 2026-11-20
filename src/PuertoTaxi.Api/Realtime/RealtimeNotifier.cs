using Microsoft.AspNetCore.SignalR;
using PuertoTaxi.Api.Contracts;

namespace PuertoTaxi.Api.Realtime;

public interface IRealtimeNotifier
{
    Task TripCreatedAsync(Guid tripId, string zone, CancellationToken ct);
    Task TripUpdatedAsync(Guid tripId, CancellationToken ct);
    Task DriverLocationUpdatedAsync(Guid driverId, decimal latitude, decimal longitude, CancellationToken ct);
    Task MessageAsync(Guid tripId, MessageDto message, CancellationToken ct);
    Task EmergencyCreatedAsync(EmergencyDto emergency, CancellationToken ct);
    Task EmergencyResolvedAsync(Guid alertId, CancellationToken ct);
}

public sealed class SignalRNotifier(IHubContext<TaxiHub> hub) : IRealtimeNotifier
{
    public Task TripCreatedAsync(Guid tripId, string zone, CancellationToken ct) =>
        hub.Clients.Group(TaxiHub.DriversGroup).SendAsync("TripCreated", new { tripId, zone }, ct);

    public Task TripUpdatedAsync(Guid tripId, CancellationToken ct) =>
        hub.Clients.Group(TaxiHub.TripGroup(tripId)).SendAsync("TripUpdated", new { tripId }, ct);

    public Task DriverLocationUpdatedAsync(Guid driverId, decimal latitude, decimal longitude, CancellationToken ct) =>
        hub.Clients.Groups(TaxiHub.AdminsGroup, TaxiHub.DriversGroup)
            .SendAsync("DriverLocationUpdated", new { driverId, latitude, longitude }, ct);

    public Task MessageAsync(Guid tripId, MessageDto message, CancellationToken ct) =>
        hub.Clients.Group(TaxiHub.TripGroup(tripId)).SendAsync("Message", message, ct);

    public Task EmergencyCreatedAsync(EmergencyDto emergency, CancellationToken ct) =>
        hub.Clients.Groups(TaxiHub.AdminsGroup, TaxiHub.DriversGroup)
            .SendAsync("EmergencyCreated", emergency, ct);

    public Task EmergencyResolvedAsync(Guid alertId, CancellationToken ct) =>
        hub.Clients.Group(TaxiHub.AdminsGroup).SendAsync("EmergencyResolved", new { alertId }, ct);
}
