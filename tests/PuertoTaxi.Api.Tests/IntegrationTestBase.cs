using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc.Testing;
using PuertoTaxi.Api.Contracts;
using PuertoTaxi.Api.Services;

namespace PuertoTaxi.Api.Tests;

public abstract class IntegrationTestBase : IClassFixture<ApiFactory>
{
    protected readonly ApiFactory Factory;
    protected readonly HttpClient Anon;

    protected IntegrationTestBase(ApiFactory factory)
    {
        Factory = factory;
        Anon = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
    }

    protected static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() }
    };

    protected CapturingSmsSender Sms => Factory.Sms;

    // ------------------------------------------------------------ helpers HTTP
    protected HttpClient WithToken(string accessToken)
    {
        var client = Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        return client;
    }

    protected static StringContent Json(object body) =>
        new(JsonSerializer.Serialize(body, JsonOpts), Encoding.UTF8, "application/json");

    protected static async Task<T> ReadAsync<T>(HttpResponseMessage res) =>
        (await res.Content.ReadFromJsonAsync<T>(JsonOpts))!;

    // ------------------------------------------------------------ identidades
    protected static string NewPhone() =>
        "5068" + Random.Shared.NextInt64(10_000_000, 99_999_999);

    protected static string NewSuffix() => Guid.NewGuid().ToString("N")[..8];

    protected async Task<AuthResponse> LoginAsync(string email, string password)
    {
        var res = await Anon.PostAsJsonAsync("/api/auth/login", new { email, password });
        res.EnsureSuccessStatusCode();
        return await ReadAsync<AuthResponse>(res);
    }

    protected async Task<HttpClient> AdminClientAsync()
    {
        var auth = await LoginAsync(ApiFactory.AdminEmail, ApiFactory.AdminPassword);
        return WithToken(auth.AccessToken);
    }

    protected async Task<(HttpClient Client, AuthResponse Auth)> NewPassengerAsync()
    {
        var phone = NewPhone();

        var request = await Anon.PostAsJsonAsync("/api/auth/otp/request", new { phone });
        request.EnsureSuccessStatusCode();

        var code = Sms.LastCodeFor(phone);
        Assert.NotNull(code);

        var verify = await Anon.PostAsJsonAsync("/api/auth/otp/verify", new { phone, code });
        verify.EnsureSuccessStatusCode();

        var auth = await ReadAsync<AuthResponse>(verify);
        return (WithToken(auth.AccessToken), auth);
    }

    protected async Task<(HttpClient Client, AdminDriverDto Driver, string Email)> NewDriverAsync(
        bool setAvailable = true)
    {
        var admin = await AdminClientAsync();
        var suffix = NewSuffix();
        var email = $"driver{suffix}@test.local";
        var phone = NewPhone();
        var plate = "T" + suffix[..6].ToUpperInvariant();

        var res = await admin.PostAsJsonAsync("/api/admin/drivers", new
        {
            fullName = "Chofer " + suffix,
            phone,
            email,
            password = ApiFactory.DriverPassword,
            licensePlate = plate,
            unitType = "SEDAN",
            currentZone = "Puntarenas Centro"
        });
        res.EnsureSuccessStatusCode();

        var driver = await ReadAsync<AdminDriverDto>(res);
        var auth = await LoginAsync(email, ApiFactory.DriverPassword);
        var client = WithToken(auth.AccessToken);

        if (setAvailable)
        {
            var status = await client.PatchAsJsonAsync("/api/drivers/me/status", new { status = "Available" });
            status.EnsureSuccessStatusCode();
        }

        return (client, driver, email);
    }

    protected async Task<TripDto> NewTripAsync(HttpClient passenger, string address = "Calle 1, casa 2")
    {
        var res = await passenger.PostAsJsonAsync("/api/trips", new
        {
            zone = "Puntarenas Centro",
            exactAddress = address,
            paymentMethod = "Sinpe",
            hasPet = false
        });
        res.EnsureSuccessStatusCode();
        return await ReadAsync<TripDto>(res);
    }
}
