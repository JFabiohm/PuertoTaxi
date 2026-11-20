using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace PuertoTaxi.Api.Tests;

public class HardeningTests(ApiFactory factory) : IntegrationTestBase(factory)
{
    [Fact]
    public async Task Cabeceras_de_seguridad_presentes()
    {
        var res = await Anon.GetAsync("/api/me");

        Assert.Equal("nosniff", res.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("DENY", res.Headers.GetValues("X-Frame-Options").Single());
        Assert.Equal("no-referrer", res.Headers.GetValues("Referrer-Policy").Single());
        Assert.Contains("frame-ancestors 'none'", res.Headers.GetValues("Content-Security-Policy").Single());
        Assert.Contains("no-store", res.Headers.GetValues("Cache-Control").Single());
    }

    [Fact]
    public async Task No_se_expone_la_cabecera_Server()
    {
        var res = await Anon.GetAsync("/health");

        Assert.False(res.Headers.Contains("Server"));
        Assert.False(res.Headers.Contains("X-Powered-By"));
    }

    [Fact]
    public async Task JSON_malformado_no_filtra_detalles_internos()
    {
        var res = await Anon.PostAsync("/api/auth/login",
            new StringContent("{ esto no es json", System.Text.Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);

        var body = await res.Content.ReadAsStringAsync();
        Assert.DoesNotContain("StackTrace", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("at PuertoTaxi", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("C:\\", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Un_token_manipulado_es_rechazado()
    {
        var auth = await LoginAsync(ApiFactory.AdminEmail, ApiFactory.AdminPassword);

        var parts = auth.AccessToken.Split('.');
        var sig = parts[2];
        parts[2] = (sig[0] == 'A' ? "B" : "A") + sig[1..];   // altera la firma

        Assert.NotEqual(sig, parts[2]);

        var client = WithToken(string.Join('.', parts));
        var res = await client.GetAsync("/api/me");

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Swagger_no_esta_expuesto_fuera_de_desarrollo()
    {
        var res = await Anon.GetAsync("/swagger/index.html");
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [Fact]
    public async Task CORS_bloquea_origenes_desconocidos()
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/health");
        request.Headers.Add("Origin", "https://sitio-malicioso.example");

        var res = await Anon.SendAsync(request);

        Assert.False(res.Headers.Contains("Access-Control-Allow-Origin"));
        Assert.False(res.Headers.Contains("Access-Control-Allow-Credentials"));
    }

    [Fact]
    public async Task Un_pasajero_no_puede_leer_la_flota_ni_las_alertas()
    {
        var (passenger, _) = await NewPassengerAsync();

        Assert.Equal(HttpStatusCode.Forbidden, (await passenger.GetAsync("/api/drivers")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await passenger.GetAsync("/api/emergency/active")).StatusCode);
    }
}

/// <summary>Prueba dedicada con límites bajos: verifica que el rate limiting corta de verdad.</summary>
public class RateLimitTests
{
    [Fact]
    public async Task Login_devuelve_429_al_exceder_el_limite()
    {
        using var factory = new ApiFactory(authPermitLimit: 3, otpPermitLimit: 10_000, globalPermitLimit: 100_000);
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 6; i++)
        {
            var res = await client.PostAsJsonAsync("/api/auth/login", new
            {
                email = "nadie@test.local",
                password = "Mala.12345"
            });
            statuses.Add(res.StatusCode);
        }

        Assert.Contains(HttpStatusCode.TooManyRequests, statuses);
        Assert.Equal((HttpStatusCode)429, statuses[^1]);
    }
}
