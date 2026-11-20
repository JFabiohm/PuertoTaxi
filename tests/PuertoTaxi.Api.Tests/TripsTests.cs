using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using PuertoTaxi.Api.Contracts;
using Xunit;

namespace PuertoTaxi.Api.Tests;

public class TripsTests(ApiFactory factory) : IntegrationTestBase(factory)
{
    [Fact]
    public async Task Pasajero_crea_viaje_en_estado_pendiente()
    {
        var (passenger, auth) = await NewPassengerAsync();
        var trip = await NewTripAsync(passenger);

        Assert.Equal("Pending", trip.Status);
        Assert.Null(trip.DriverId);
        Assert.Equal(auth.User.Id, trip.PassengerId);
    }

    [Fact]
    public async Task El_viaje_aparece_en_mis_viajes()
    {
        var (passenger, _) = await NewPassengerAsync();
        var trip = await NewTripAsync(passenger);

        var mine = await passenger.GetFromJsonAsync<List<TripDto>>("/api/trips/me");

        Assert.Contains(mine!, t => t.Id == trip.Id);
    }

    [Fact]
    public async Task Otro_pasajero_no_puede_ver_mi_viaje()
    {
        var (passengerA, _) = await NewPassengerAsync();
        var trip = await NewTripAsync(passengerA);

        var (passengerB, _) = await NewPassengerAsync();
        var res = await passengerB.GetAsync($"/api/trips/{trip.Id}");

        // 404 (no 403) para no confirmar que el viaje existe.
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [Fact]
    public async Task Pasajero_no_puede_aceptar_viajes()
    {
        var (passenger, _) = await NewPassengerAsync();
        var trip = await NewTripAsync(passenger);

        var res = await passenger.PostAsync($"/api/trips/{trip.Id}/accept", null);
        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
    }

    [Fact]
    public async Task Chofer_toma_el_viaje_y_otro_chofer_recibe_409()
    {
        var (passenger, _) = await NewPassengerAsync();
        var trip = await NewTripAsync(passenger);

        var (driverA, _, _) = await NewDriverAsync();
        var (driverB, _, _) = await NewDriverAsync();

        var acceptA = await driverA.PostAsync($"/api/trips/{trip.Id}/accept", null);
        acceptA.EnsureSuccessStatusCode();

        var accepted = await ReadAsync<TripDto>(acceptA);
        Assert.Equal("Accepted", accepted.Status);
        Assert.NotNull(accepted.DriverId);

        var acceptB = await driverB.PostAsync($"/api/trips/{trip.Id}/accept", null);
        Assert.Equal(HttpStatusCode.Conflict, acceptB.StatusCode);
    }

    [Fact]
    public async Task La_bolsa_de_pendientes_oculta_direccion_y_telefono()
    {
        var (passenger, _) = await NewPassengerAsync();
        var trip = await NewTripAsync(passenger, "Casa 123, 200m norte del muelle");

        var (driver, _, _) = await NewDriverAsync();
        var available = await driver.GetFromJsonAsync<List<TripDto>>("/api/trips/available");

        var listed = available!.Single(t => t.Id == trip.Id);
        Assert.DoesNotContain("muelle", listed.ExactAddress, StringComparison.OrdinalIgnoreCase);
        Assert.Null(listed.PassengerPhoneMasked);
    }

    [Fact]
    public async Task Chofer_no_puede_ver_viaje_que_no_atiende()
    {
        var (passenger, _) = await NewPassengerAsync();
        var trip = await NewTripAsync(passenger);

        var (driver, _, _) = await NewDriverAsync();
        var res = await driver.GetAsync($"/api/trips/{trip.Id}");

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [Fact]
    public async Task No_se_puede_completar_un_viaje_que_no_ha_iniciado()
    {
        var (passenger, _) = await NewPassengerAsync();
        var trip = await NewTripAsync(passenger);
        var (driver, _, _) = await NewDriverAsync();

        (await driver.PostAsync($"/api/trips/{trip.Id}/accept", null)).EnsureSuccessStatusCode();

        var complete = await driver.PostAsJsonAsync($"/api/trips/{trip.Id}/complete", new { price = 5000 });
        Assert.Equal(HttpStatusCode.Conflict, complete.StatusCode);
    }

    [Fact]
    public async Task Flujo_completo_aceptar_iniciar_completar()
    {
        var (passenger, _) = await NewPassengerAsync();
        var trip = await NewTripAsync(passenger);
        var (driver, driverDto, _) = await NewDriverAsync();

        (await driver.PostAsync($"/api/trips/{trip.Id}/accept", null)).EnsureSuccessStatusCode();
        (await driver.PostAsync($"/api/trips/{trip.Id}/start", null)).EnsureSuccessStatusCode();

        var complete = await driver.PostAsJsonAsync($"/api/trips/{trip.Id}/complete", new { price = 4500 });
        complete.EnsureSuccessStatusCode();

        var finished = await ReadAsync<TripDto>(complete);
        Assert.Equal("Completed", finished.Status);
        Assert.Equal(4500m, finished.Price);

        // El chofer vuelve a quedar disponible automáticamente.
        var fleet = await driver.GetFromJsonAsync<List<DriverDto>>("/api/drivers", JsonOpts);
        Assert.Equal("Available", fleet!.Single(d => d.Id == driverDto.Id).Status.ToString());
    }

    [Fact]
    public async Task Pasajero_puede_cancelar_su_viaje_y_el_chofer_ya_no_lo_toma()
    {
        var (passenger, _) = await NewPassengerAsync();
        var trip = await NewTripAsync(passenger);

        var cancel = await passenger.PostAsJsonAsync($"/api/trips/{trip.Id}/cancel", new { reason = "ya no lo necesito" });
        cancel.EnsureSuccessStatusCode();

        var cancelled = await ReadAsync<TripDto>(cancel);
        Assert.Equal("Cancelled", cancelled.Status);

        var (driver, _, _) = await NewDriverAsync();
        var accept = await driver.PostAsync($"/api/trips/{trip.Id}/accept", null);
        Assert.Equal(HttpStatusCode.Conflict, accept.StatusCode);
    }

    [Fact]
    public async Task Dos_cancelaciones_simultaneas_solo_confirma_una()
    {
        var (passenger, _) = await NewPassengerAsync();
        var trip = await NewTripAsync(passenger);

        var responses = await Task.WhenAll(
            passenger.PostAsJsonAsync($"/api/trips/{trip.Id}/cancel", new { reason = "cancelación 1" }),
            passenger.PostAsJsonAsync($"/api/trips/{trip.Id}/cancel", new { reason = "cancelación 2" }));

        Assert.Single(responses, response => response.StatusCode == HttpStatusCode.OK);
        Assert.Single(responses, response => response.StatusCode == HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Viaje_expirado_no_se_puede_aceptar()
    {
        var (passenger, _) = await NewPassengerAsync();
        var trip = await NewTripAsync(passenger);

        // Simula que ya pasaron los 15 segundos.
        await Factory.WithDbAsync(async db =>
        {
            var entity = await db.Trips.SingleAsync(t => t.Id == trip.Id);
            entity.ExpiresAtUtc = DateTime.UtcNow.AddMinutes(-1);
            await db.SaveChangesAsync();
        });

        var (driver, _, _) = await NewDriverAsync();
        var accept = await driver.PostAsync($"/api/trips/{trip.Id}/accept", null);

        Assert.Equal(HttpStatusCode.Conflict, accept.StatusCode);
    }

    [Fact]
    public async Task El_servidor_ignora_campos_que_no_le_corresponden()
    {
        var (passenger, _) = await NewPassengerAsync();
        var (_, otherDriver, _) = await NewDriverAsync();

        // Intento de mass assignment: el cliente manda estado, chofer y precio.
        var res = await passenger.PostAsync("/api/trips", Json(new
        {
            zone = "Puntarenas Centro",
            exactAddress = "Calle 5",
            paymentMethod = "Sinpe",
            hasPet = false,
            status = "Completed",
            driverId = otherDriver.Id,
            price = 0,
            passengerId = Guid.NewGuid()
        }));

        res.EnsureSuccessStatusCode();
        var trip = await ReadAsync<TripDto>(res);

        Assert.Equal("Pending", trip.Status);
        Assert.Null(trip.DriverId);
        Assert.Null(trip.Price);
    }

    [Fact]
    public async Task Chat_funciona_solo_entre_participantes_de_un_viaje_activo()
    {
        var (passenger, _) = await NewPassengerAsync();
        var trip = await NewTripAsync(passenger);
        var (driver, _, _) = await NewDriverAsync();

        // Todavía no hay chofer asignado: no se puede chatear.
        var tooEarly = await passenger.PostAsJsonAsync($"/api/trips/{trip.Id}/messages", new { text = "hola" });
        Assert.Equal(HttpStatusCode.Conflict, tooEarly.StatusCode);

        (await driver.PostAsync($"/api/trips/{trip.Id}/accept", null)).EnsureSuccessStatusCode();

        var sent = await passenger.PostAsJsonAsync($"/api/trips/{trip.Id}/messages", new { text = "Estoy en la esquina" });
        sent.EnsureSuccessStatusCode();

        var messages = await driver.GetFromJsonAsync<List<MessageDto>>($"/api/trips/{trip.Id}/messages");
        Assert.Contains(messages!, m => m.Text == "Estoy en la esquina" && m.SenderRole == "Passenger");

        // Un tercero no puede leer ni escribir en ese chat.
        var (stranger, _) = await NewPassengerAsync();
        var read = await stranger.GetAsync($"/api/trips/{trip.Id}/messages");
        Assert.Equal(HttpStatusCode.NotFound, read.StatusCode);

        var write = await stranger.PostAsJsonAsync($"/api/trips/{trip.Id}/messages", new { text = "intruso" });
        Assert.Equal(HttpStatusCode.NotFound, write.StatusCode);
    }

    [Fact]
    public async Task Un_pasajero_no_ve_los_viajes_de_otro()
    {
        var (passengerA, _) = await NewPassengerAsync();
        var tripA = await NewTripAsync(passengerA);

        var (passengerB, _) = await NewPassengerAsync();
        var mineB = await passengerB.GetFromJsonAsync<List<TripDto>>("/api/trips/me");

        Assert.DoesNotContain(mineB!, t => t.Id == tripA.Id);
    }
}
