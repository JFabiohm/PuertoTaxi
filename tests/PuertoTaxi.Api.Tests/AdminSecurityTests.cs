using System.Net;
using System.Net.Http.Json;
using PuertoTaxi.Api.Contracts;
using Xunit;

namespace PuertoTaxi.Api.Tests;

public class AdminSecurityTests(ApiFactory factory) : IntegrationTestBase(factory)
{
    [Fact]
    public async Task Pasajero_no_puede_entrar_a_endpoints_de_admin()
    {
        var (passenger, _) = await NewPassengerAsync();

        var res = await passenger.GetAsync("/api/admin/drivers");
        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
    }

    [Fact]
    public async Task Chofer_no_puede_entrar_a_endpoints_de_admin()
    {
        var (driver, _, _) = await NewDriverAsync();

        var res = await driver.GetAsync("/api/admin/stats");
        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
    }

    [Fact]
    public async Task No_hay_auto_escalada_de_rol_por_el_perfil()
    {
        var (passenger, auth) = await NewPassengerAsync();

        var res = await passenger.PatchAsync("/api/me", Json(new
        {
            fullName = "Nuevo Nombre",
            role = "Admin",
            isActive = true,
            phone = "50699999999",
            email = "hacker@test.local"
        }));

        res.EnsureSuccessStatusCode();

        var me = await ReadAsync<UserDto>(res);
        Assert.Equal("Passenger", me.Role.ToString());
        Assert.Equal(auth.User.Id, me.Id);
    }

    [Fact]
    public async Task Chofer_desactivado_pierde_el_acceso_de_inmediato()
    {
        var (driver, driverDto, email) = await NewDriverAsync();

        // Antes de desactivar, el token funciona.
        Assert.Equal(HttpStatusCode.OK, (await driver.GetAsync("/api/me")).StatusCode);

        var admin = await AdminClientAsync();
        var delete = await admin.DeleteAsync($"/api/admin/drivers/{driverDto.Id}");
        Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);

        // El mismo token (aún no expirado) deja de servir.
        var afterDelete = await driver.GetAsync("/api/me");
        Assert.Equal(HttpStatusCode.Unauthorized, afterDelete.StatusCode);

        // Y no puede volver a entrar.
        var login = await Anon.PostAsJsonAsync("/api/auth/login", new { email, password = ApiFactory.DriverPassword });
        Assert.Equal(HttpStatusCode.Unauthorized, login.StatusCode);
    }

    [Fact]
    public async Task Un_admin_puede_crear_chofer_pero_no_con_password_debil()
    {
        var admin = await AdminClientAsync();
        var suffix = NewSuffix();

        var weak = await admin.PostAsJsonAsync("/api/admin/drivers", new
        {
            fullName = "Chofer Debil",
            phone = NewPhone(),
            email = $"weak{suffix}@test.local",
            password = "12345678",
            licensePlate = "W" + suffix[..6],
            unitType = "SEDAN",
            currentZone = "Puntarenas Centro"
        });

        Assert.Equal(HttpStatusCode.BadRequest, weak.StatusCode);
    }

    [Fact]
    public async Task No_se_pueden_duplicar_placas_ni_correos()
    {
        var (_, driver, email) = await NewDriverAsync();
        var admin = await AdminClientAsync();

        var duplicatePlate = await admin.PostAsJsonAsync("/api/admin/drivers", new
        {
            fullName = "Otro Chofer",
            phone = NewPhone(),
            email = $"x{NewSuffix()}@test.local",
            password = ApiFactory.DriverPassword,
            licensePlate = driver.LicensePlate,
            unitType = "SEDAN",
            currentZone = "Puntarenas Centro"
        });

        Assert.Equal(HttpStatusCode.Conflict, duplicatePlate.StatusCode);

        var duplicateEmail = await admin.PostAsJsonAsync("/api/admin/drivers", new
        {
            fullName = "Otro Chofer",
            phone = NewPhone(),
            email,
            password = ApiFactory.DriverPassword,
            licensePlate = "Z" + NewSuffix()[..6],
            unitType = "SEDAN",
            currentZone = "Puntarenas Centro"
        });

        Assert.Equal(HttpStatusCode.Conflict, duplicateEmail.StatusCode);
    }

    [Fact]
    public async Task El_chofer_no_puede_ponerse_en_OnTrip_por_su_cuenta()
    {
        var (driver, _, _) = await NewDriverAsync();

        var res = await driver.PatchAsJsonAsync("/api/drivers/me/status", new { status = "OnTrip" });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    // ------------------------------------------------------------ 10-33
    [Fact]
    public async Task Solo_un_chofer_puede_disparar_la_alerta_10_33()
    {
        var (passenger, _) = await NewPassengerAsync();

        var res = await passenger.PostAsJsonAsync("/api/emergency", new
        {
            latitude = 9.976,
            longitude = -84.838
        });

        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
    }

    [Fact]
    public async Task Solo_un_admin_puede_apagar_la_alerta_10_33()
    {
        var (driver, _, _) = await NewDriverAsync();

        var trigger = await driver.PostAsJsonAsync("/api/emergency", new
        {
            latitude = 9.976m,
            longitude = -84.838m,
            note = "prueba"
        });
        trigger.EnsureSuccessStatusCode();
        var alert = await ReadAsync<EmergencyDto>(trigger);

        // Otro chofer no puede apagarla.
        var (otherDriver, _, _) = await NewDriverAsync();
        var denied = await otherDriver.PostAsJsonAsync($"/api/emergency/{alert.Id}/resolve", new { note = "x" });
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);

        // El pasajero tampoco.
        var (passenger, _) = await NewPassengerAsync();
        Assert.Equal(HttpStatusCode.Forbidden,
            (await passenger.PostAsJsonAsync($"/api/emergency/{alert.Id}/resolve", new { })).StatusCode);

        // El admin sí.
        var admin = await AdminClientAsync();
        var resolved = await admin.PostAsJsonAsync($"/api/emergency/{alert.Id}/resolve", new { note = "falsa alarma" });
        Assert.Equal(HttpStatusCode.NoContent, resolved.StatusCode);

        var active = await admin.GetFromJsonAsync<List<EmergencyDto>>("/api/emergency/active");
        Assert.DoesNotContain(active!, a => a.Id == alert.Id);
    }

    [Fact]
    public async Task Solo_un_admin_ve_los_datos_de_contacto_de_la_flota()
    {
        var (_, driver, email) = await NewDriverAsync();
        var admin = await AdminClientAsync();

        var list = await admin.GetFromJsonAsync<List<AdminDriverDto>>("/api/admin/drivers", JsonOpts);
        var found = list!.Single(d => d.Id == driver.Id);

        Assert.Equal(email, found.Email);
        Assert.False(string.IsNullOrWhiteSpace(found.Phone));

        // Un chofer normal no tiene ese endpoint, pero además /api/drivers no expone email.
        var (otherDriver, _, _) = await NewDriverAsync();
        var publicFleet = await otherDriver.GetStringAsync("/api/drivers");
        Assert.DoesNotContain("@test.local", publicFleet, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Las_acciones_sensibles_quedan_en_la_auditoria()
    {
        var (_, driver, _) = await NewDriverAsync();
        var admin = await AdminClientAsync();

        var logs = await admin.GetStringAsync("/api/admin/audit?take=200");

        Assert.Contains("admin.driver_create", logs, StringComparison.OrdinalIgnoreCase);
        Assert.Contains(driver.Id.ToString(), logs, StringComparison.OrdinalIgnoreCase);
    }
}
