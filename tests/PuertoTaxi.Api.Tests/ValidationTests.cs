using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using PuertoTaxi.Api.Contracts;
using Xunit;

namespace PuertoTaxi.Api.Tests;

public class ValidationTests(ApiFactory factory) : IntegrationTestBase(factory)
{
    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Direccion_vacia_es_rechazada(string address)
    {
        var (passenger, _) = await NewPassengerAsync();

        var res = await passenger.PostAsJsonAsync("/api/trips", new
        {
            zone = "Puntarenas Centro",
            exactAddress = address,
            paymentMethod = "Sinpe",
            hasPet = false
        });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Zona_fuera_de_la_lista_es_rechazada()
    {
        var (passenger, _) = await NewPassengerAsync();

        var res = await passenger.PostAsJsonAsync("/api/trips", new
        {
            zone = "Zona Inventada",
            exactAddress = "Calle 1",
            paymentMethod = "Sinpe",
            hasPet = false
        });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Direccion_demasiado_larga_es_rechazada()
    {
        var (passenger, _) = await NewPassengerAsync();

        var res = await passenger.PostAsJsonAsync("/api/trips", new
        {
            zone = "Puntarenas Centro",
            exactAddress = new string('A', 300),
            paymentMethod = "Sinpe",
            hasPet = false
        });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Caracteres_de_control_son_rechazados()
    {
        var (passenger, _) = await NewPassengerAsync();

        var res = await passenger.PostAsJsonAsync("/api/trips", new
        {
            zone = "Puntarenas Centro",
            exactAddress = "Calle 1\u0007timbre",
            paymentMethod = "Sinpe",
            hasPet = false
        });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Metodo_de_pago_invalido_es_rechazado()
    {
        var (passenger, _) = await NewPassengerAsync();

        var res = await passenger.PostAsJsonAsync("/api/trips", new
        {
            zone = "Puntarenas Centro",
            exactAddress = "Calle 1",
            paymentMethod = "Bitcoin",
            hasPet = false
        });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Telefono_invalido_es_rechazado()
    {
        var res = await Anon.PostAsJsonAsync("/api/auth/otp/request", new { phone = "abc" });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Intentos_de_SQL_injection_se_guardan_como_texto_literal()
    {
        var (passenger, _) = await NewPassengerAsync();
        const string payload = "'; DROP TABLE Users; --";

        var res = await passenger.PostAsJsonAsync("/api/trips", new
        {
            zone = "Puntarenas Centro",
            exactAddress = payload,
            paymentMethod = "Sinpe",
            hasPet = false
        });

        // Se acepta como texto normal (no se ejecuta), porque EF usa consultas parametrizadas.
        res.EnsureSuccessStatusCode();
        var trip = await ReadAsync<TripDto>(res);
        Assert.Equal(payload, trip.ExactAddress);

        // La tabla Users sigue existiendo y el admin puede iniciar sesión.
        var admin = await AdminClientAsync();
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/api/admin/stats")).StatusCode);

        var count = await Factory.WithDbAsync(db => db.Users.CountAsync());
        Assert.True(count > 0);
    }

    [Fact]
    public async Task Mensaje_vacio_es_rechazado()
    {
        var (passenger, _) = await NewPassengerAsync();
        var trip = await NewTripAsync(passenger);
        var (driver, _, _) = await NewDriverAsync();
        (await driver.PostAsync($"/api/trips/{trip.Id}/accept", null)).EnsureSuccessStatusCode();

        var res = await passenger.PostAsJsonAsync($"/api/trips/{trip.Id}/messages", new
        {
            text = "   ",
            audioData = (string?)null
        });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Audio_demasiado_grande_es_rechazado()
    {
        var (passenger, _) = await NewPassengerAsync();
        var trip = await NewTripAsync(passenger);
        var (driver, _, _) = await NewDriverAsync();
        (await driver.PostAsync($"/api/trips/{trip.Id}/accept", null)).EnsureSuccessStatusCode();

        var res = await passenger.PostAsJsonAsync($"/api/trips/{trip.Id}/messages", new
        {
            text = (string?)null,
            audioData = "data:audio/webm;base64," + new string('A', 400_000)
        });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Coordenadas_fuera_de_rango_son_rechazadas()
    {
        var (driver, _, _) = await NewDriverAsync();

        var res = await driver.PatchAsJsonAsync("/api/drivers/me/location", new
        {
            latitude = 120.0,
            longitude = -300.0
        });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Un_pasajero_no_puede_actualizar_ubicacion_de_chofer()
    {
        var (passenger, _) = await NewPassengerAsync();

        var res = await passenger.PatchAsJsonAsync("/api/drivers/me/location", new
        {
            latitude = 9.9,
            longitude = -84.8
        });

        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
    }
}
