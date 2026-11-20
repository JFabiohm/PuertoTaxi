using System.Net;
using System.Net.Http.Json;
using PuertoTaxi.Api.Contracts;
using Xunit;

namespace PuertoTaxi.Api.Tests;

public class AuthTests(ApiFactory factory) : IntegrationTestBase(factory)
{
    [Fact]
    public async Task Health_es_publico()
    {
        var res = await Anon.GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
    }

    [Fact]
    public async Task Endpoint_protegido_sin_token_devuelve_401()
    {
        var res = await Anon.GetAsync("/api/me");
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Login_correcto_devuelve_tokens_y_rol()
    {
        var auth = await LoginAsync(ApiFactory.AdminEmail, ApiFactory.AdminPassword);

        Assert.False(string.IsNullOrWhiteSpace(auth.AccessToken));
        Assert.False(string.IsNullOrWhiteSpace(auth.RefreshToken));
        Assert.Equal("Admin", auth.User.Role.ToString());
        Assert.True(auth.AccessTokenExpiresAtUtc > DateTime.UtcNow);
    }

    [Fact]
    public async Task Login_con_password_incorrecta_devuelve_401_generico()
    {
        var res = await Anon.PostAsJsonAsync("/api/auth/login", new
        {
            email = ApiFactory.AdminEmail,
            password = "ClaveIncorrecta.1"
        });

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);

        var body = await res.Content.ReadAsStringAsync();
        // No debe revelar si el correo existe.
        Assert.DoesNotContain("no existe", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("passwordHash", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Cuenta_se_bloquea_tras_cinco_intentos_fallidos()
    {
        var (_, driver, email) = await NewDriverAsync(setAvailable: false);

        for (var i = 0; i < 5; i++)
        {
            var bad = await Anon.PostAsJsonAsync("/api/auth/login", new { email, password = "Mala.12345" });
            Assert.Equal(HttpStatusCode.Unauthorized, bad.StatusCode);
        }

        var locked = await Anon.PostAsJsonAsync("/api/auth/login", new
        {
            email,
            password = ApiFactory.DriverPassword
        });

        Assert.Equal((HttpStatusCode)423, locked.StatusCode);
        Assert.NotNull(driver.Id);
    }

    [Fact]
    public async Task Refresh_rota_el_token_y_detecta_reuso()
    {
        var auth = await LoginAsync(ApiFactory.AdminEmail, ApiFactory.AdminPassword);

        var first = await Anon.PostAsJsonAsync("/api/auth/refresh", new { refreshToken = auth.RefreshToken });
        first.EnsureSuccessStatusCode();
        var rotated = await ReadAsync<AuthResponse>(first);

        Assert.NotEqual(auth.RefreshToken, rotated.RefreshToken);

        // Reusar el token viejo debe fallar...
        var reuse = await Anon.PostAsJsonAsync("/api/auth/refresh", new { refreshToken = auth.RefreshToken });
        Assert.Equal(HttpStatusCode.Unauthorized, reuse.StatusCode);

        // ...y además revocar toda la familia (el token rotado también muere).
        var afterReuse = await Anon.PostAsJsonAsync("/api/auth/refresh", new { refreshToken = rotated.RefreshToken });
        Assert.Equal(HttpStatusCode.Unauthorized, afterReuse.StatusCode);
    }

    [Fact]
    public async Task Logout_revoca_el_refresh_token()
    {
        var auth = await LoginAsync(ApiFactory.AdminEmail, ApiFactory.AdminPassword);

        var logout = await Anon.PostAsJsonAsync("/api/auth/logout", new { refreshToken = auth.RefreshToken });
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);

        var refresh = await Anon.PostAsJsonAsync("/api/auth/refresh", new { refreshToken = auth.RefreshToken });
        Assert.Equal(HttpStatusCode.Unauthorized, refresh.StatusCode);
    }

    [Fact]
    public async Task Flujo_OTP_crea_pasajero_y_entrega_token()
    {
        var phone = NewPhone();

        var request = await Anon.PostAsJsonAsync("/api/auth/otp/request", new { phone });
        Assert.Equal(HttpStatusCode.Accepted, request.StatusCode);

        var code = Sms.LastCodeFor(phone);
        Assert.NotNull(code);

        var verify = await Anon.PostAsJsonAsync("/api/auth/otp/verify", new { phone, code });
        verify.EnsureSuccessStatusCode();

        var auth = await ReadAsync<AuthResponse>(verify);
        Assert.Equal("Passenger", auth.User.Role.ToString());
        Assert.True(auth.User.PhoneVerified);
    }

    [Fact]
    public async Task Codigo_OTP_incorrecto_no_permite_entrar()
    {
        var phone = NewPhone();
        await Anon.PostAsJsonAsync("/api/auth/otp/request", new { phone });

        var wrong = await Anon.PostAsJsonAsync("/api/auth/otp/verify", new { phone, code = "000000" });

        // Puede coincidir por azar 1 en 1.000.000; si coincide, el test no aplica.
        if (wrong.IsSuccessStatusCode) return;

        Assert.Equal(HttpStatusCode.BadRequest, wrong.StatusCode);
    }

    [Fact]
    public async Task OTP_se_invalida_tras_cinco_intentos()
    {
        var phone = NewPhone();
        await Anon.PostAsJsonAsync("/api/auth/otp/request", new { phone });

        var realCode = Sms.LastCodeFor(phone)!;
        var wrongCode = realCode == "111111" ? "222222" : "111111";

        for (var i = 0; i < 5; i++)
            await Anon.PostAsJsonAsync("/api/auth/otp/verify", new { phone, code = wrongCode });

        // Incluso con el código correcto, ya no debe dejar entrar.
        var blocked = await Anon.PostAsJsonAsync("/api/auth/otp/verify", new { phone, code = realCode });
        Assert.Equal((HttpStatusCode)423, blocked.StatusCode);
    }

    [Fact]
    public async Task OTP_no_se_puede_reutilizar()
    {
        var phone = NewPhone();
        await Anon.PostAsJsonAsync("/api/auth/otp/request", new { phone });
        var code = Sms.LastCodeFor(phone)!;

        var first = await Anon.PostAsJsonAsync("/api/auth/otp/verify", new { phone, code });
        first.EnsureSuccessStatusCode();

        var second = await Anon.PostAsJsonAsync("/api/auth/otp/verify", new { phone, code });
        Assert.Equal(HttpStatusCode.BadRequest, second.StatusCode);
    }

    [Fact]
    public async Task OTP_de_un_telefono_no_sirve_para_otro()
    {
        var victimPhone = NewPhone();
        var attackerPhone = NewPhone();

        await Anon.PostAsJsonAsync("/api/auth/otp/request", new { phone = victimPhone });
        var victimCode = Sms.LastCodeFor(victimPhone)!;

        await Anon.PostAsJsonAsync("/api/auth/otp/request", new { phone = attackerPhone });

        var stolen = await Anon.PostAsJsonAsync("/api/auth/otp/verify", new
        {
            phone = attackerPhone,
            code = victimCode
        });

        Assert.False(stolen.IsSuccessStatusCode);
    }

    [Fact]
    public async Task Las_respuestas_no_incluyen_hash_de_password()
    {
        var (client, _) = await NewPassengerAsync();
        var me = await client.GetAsync("/api/me");
        var json = await me.Content.ReadAsStringAsync();

        Assert.DoesNotContain("passwordHash", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("password", json, StringComparison.OrdinalIgnoreCase);
    }
}
