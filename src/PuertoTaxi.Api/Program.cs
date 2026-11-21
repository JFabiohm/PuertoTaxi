using System.Text;
using System.Security.Claims;
using System.Threading.RateLimiting;
using FluentValidation;
using FluentValidation.AspNetCore;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;
using PuertoTaxi.Api.Configuration;
using PuertoTaxi.Api.Data;
using PuertoTaxi.Api.Domain;
using PuertoTaxi.Api.Realtime;
using PuertoTaxi.Api.Security;
using PuertoTaxi.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// ---------------------------------------------------------------- Kestrel
builder.WebHost.ConfigureKestrel(o =>
{
    o.AddServerHeader = false;                                  // no revelar "Server: Kestrel"
    o.Limits.MaxRequestBodySize = 2 * 1024 * 1024;              // 2 MB (audio de chat incluido)
    o.Limits.MaxRequestHeadersTotalSize = 32 * 1024;
});

// ---------------------------------------------------------------- opciones
// En entorno de pruebas permitimos valores por defecto seguros para no depender de secretos locales.
if (builder.Environment.IsEnvironment("Testing"))
{
    var defaults = new Dictionary<string, string?>();

    if (string.IsNullOrWhiteSpace(builder.Configuration["Jwt:Key"]))
        defaults["Jwt:Key"] = Convert.ToBase64String(
            System.Security.Cryptography.RandomNumberGenerator.GetBytes(48));

    if (string.IsNullOrWhiteSpace(builder.Configuration.GetConnectionString("Default")))
        defaults["ConnectionStrings:Default"] =
            "Server=(localdb)\\MSSQLLocalDB;Database=PuertoTaxiTests_Bootstrap;Trusted_Connection=True;TrustServerCertificate=True";

    if (string.IsNullOrWhiteSpace(builder.Configuration["Seed:AdminPassword"]))
        defaults["Seed:AdminPassword"] = "Admin.12345";

    if (string.IsNullOrWhiteSpace(builder.Configuration["Seed:AdminEmail"]))
        defaults["Seed:AdminEmail"] = "admin@test.local";

    if (string.IsNullOrWhiteSpace(builder.Configuration["Seed:AdminPhone"]))
        defaults["Seed:AdminPhone"] = "50600000001";

    if (defaults.Count > 0)
        builder.Configuration.AddInMemoryCollection(defaults);
}

builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection(JwtOptions.SectionName));
builder.Services.Configure<OtpOptions>(builder.Configuration.GetSection(OtpOptions.SectionName));
builder.Services.Configure<SeedOptions>(builder.Configuration.GetSection(SeedOptions.SectionName));
builder.Services.Configure<AppOptions>(builder.Configuration.GetSection(AppOptions.SectionName));
builder.Services.Configure<ProxyOptions>(builder.Configuration.GetSection(ProxyOptions.SectionName));
builder.Services.Configure<WhatsAppOptions>(builder.Configuration.GetSection(WhatsAppOptions.SectionName));

var jwtOptions = builder.Configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>() ?? new JwtOptions();
jwtOptions.Validate();

var appOptions = builder.Configuration.GetSection(AppOptions.SectionName).Get<AppOptions>() ?? new AppOptions();
var proxyOptions = builder.Configuration.GetSection(ProxyOptions.SectionName).Get<ProxyOptions>() ?? new ProxyOptions();

if (proxyOptions.Enabled)
{
    if (proxyOptions.KnownProxies.Length == 0)
        throw new InvalidOperationException("Proxy:KnownProxies es obligatoria cuando Proxy:Enabled está activo.");

    builder.Services.Configure<ForwardedHeadersOptions>(o =>
    {
        o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
        o.KnownNetworks.Clear();
        o.KnownProxies.Clear();

        foreach (var value in proxyOptions.KnownProxies)
        {
            if (!System.Net.IPAddress.TryParse(value, out var address))
                throw new InvalidOperationException($"Proxy:KnownProxies contiene una IP inválida: {value}");

            o.KnownProxies.Add(address);
        }
    });
}

// ---------------------------------------------------------------- datos
var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? throw new InvalidOperationException("Falta ConnectionStrings:Default.");

builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseSqlServer(connectionString, sql =>
    {
        sql.EnableRetryOnFailure(3, TimeSpan.FromSeconds(5), null);
        sql.CommandTimeout(30);
    }));

// ---------------------------------------------------------------- servicios
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<CurrentUser>();
builder.Services.AddScoped<IPasswordHasher<User>, PasswordHasher<User>>();
builder.Services.AddScoped<TokenService>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<OtpService>();
builder.Services.AddScoped<AuditService>();
builder.Services.AddHttpClient<IWhatsAppSender, WhatsAppSender>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(15);
});
builder.Services.AddSingleton<IRealtimeNotifier, SignalRNotifier>();
builder.Services.AddSingleton<CapturingSmsSender>();
builder.Services.AddHostedService<MaintenanceService>();

// Proveedor de SMS: webhook en producción, log en desarrollo, captura en tests.
if (builder.Environment.IsEnvironment("Testing"))
    builder.Services.AddSingleton<ISmsSender>(sp => sp.GetRequiredService<CapturingSmsSender>());
else if (!string.IsNullOrWhiteSpace(builder.Configuration["Sms:WebhookUrl"]))
    builder.Services.AddHttpClient<ISmsSender, WebhookSmsSender>(c => c.Timeout = TimeSpan.FromSeconds(10));
else
    builder.Services.AddSingleton<ISmsSender, LogSmsSender>();

// ---------------------------------------------------------------- validación
builder.Services.AddFluentValidationAutoValidation();
builder.Services.AddValidatorsFromAssemblyContaining<Program>();

// ---------------------------------------------------------------- autenticación JWT
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.RequireHttpsMetadata = !builder.Environment.IsDevelopment();
        o.SaveToken = false;
        o.MapInboundClaims = false;   // conservar "sub" y "role" tal cual, sin mapearlos a ClaimTypes.*

        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtOptions.Issuer,
            ValidateAudience = true,
            ValidAudience = jwtOptions.Audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOptions.Key)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30),
            NameClaimType = AppClaims.Name,
            RoleClaimType = AppClaims.Role
        };

        // SignalR no puede mandar cabeceras en el handshake: acepta ?access_token= solo en /hubs.
        o.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                var token = ctx.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(token) &&
                    ctx.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                {
                    ctx.Token = token;
                }
                return Task.CompletedTask;
            },

            // El token es stateless, pero comprobamos en cada petición que la cuenta siga
            // activa y con el mismo rol. Así un chofer despedido pierde acceso de inmediato.
            OnTokenValidated = async ctx =>
            {
                var raw = ctx.Principal?.FindFirstValue(AppClaims.UserId);
                if (!Guid.TryParse(raw, out var userId))
                {
                    ctx.Fail("invalid_subject");
                    return;
                }

                var db = ctx.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
                var user = await db.Users.AsNoTracking()
                    .Where(u => u.Id == userId)
                    .Select(u => new { u.IsActive, u.Role })
                    .SingleOrDefaultAsync(ctx.HttpContext.RequestAborted);

                if (user is null || !user.IsActive)
                {
                    ctx.Fail("user_disabled");
                    return;
                }

                var tokenRole = ctx.Principal?.FindFirstValue(AppClaims.Role);
                if (!string.Equals(tokenRole, user.Role.ToString(), StringComparison.Ordinal))
                    ctx.Fail("role_changed");
            }
        };
    });

builder.Services.AddAuthorization(o =>
{
    o.AddPolicy(Policies.PassengerOnly, p => p.RequireRole(nameof(UserRole.Passenger)));
    o.AddPolicy(Policies.DriverOnly, p => p.RequireRole(nameof(UserRole.Driver)));
    o.AddPolicy(Policies.AdminOnly, p => p.RequireRole(nameof(UserRole.Admin)));
    o.AddPolicy(Policies.DriverOrAdmin, p => p.RequireRole(nameof(UserRole.Driver), nameof(UserRole.Admin)));
    o.AddPolicy(Policies.Authenticated, p => p.RequireAuthenticatedUser());
});

// ---------------------------------------------------------------- rate limiting
static string ClientKey(HttpContext ctx) =>
    ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";

builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.OnRejected = async (context, cancellationToken) =>
    {
        context.HttpContext.Response.Headers.RetryAfter = "60";
        context.HttpContext.Response.ContentType = "application/problem+json";

        await context.HttpContext.Response.WriteAsJsonAsync(new ProblemDetails
        {
            Status = StatusCodes.Status429TooManyRequests,
            Title = "Demasiadas solicitudes",
            Detail = "Espera un minuto antes de volver a solicitar un código."
        }, cancellationToken);
    };

    o.AddPolicy("auth", ctx => RateLimitPartition.GetFixedWindowLimiter(ClientKey(ctx), _ =>
        new FixedWindowRateLimiterOptions
        {
            PermitLimit = appOptions.AuthRateLimitPerMinute,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        }));

    o.AddPolicy("otp-request", ctx => RateLimitPartition.GetFixedWindowLimiter(ClientKey(ctx), _ =>
        new FixedWindowRateLimiterOptions
        {
            PermitLimit = Math.Max(1, appOptions.OtpRateLimitPerMinute / 2),
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        }));

    o.AddPolicy("otp-verify", ctx => RateLimitPartition.GetFixedWindowLimiter(ClientKey(ctx), _ =>
        new FixedWindowRateLimiterOptions
        {
            PermitLimit = Math.Max(10, appOptions.OtpRateLimitPerMinute * 3),
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        }));

    o.AddPolicy("chat", ctx => RateLimitPartition.GetFixedWindowLimiter(ClientKey(ctx), _ =>
        new FixedWindowRateLimiterOptions
        {
            PermitLimit = appOptions.ChatRateLimitPerMinute,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        }));

    o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
        RateLimitPartition.GetFixedWindowLimiter(ClientKey(ctx), _ =>
            new FixedWindowRateLimiterOptions
            {
                PermitLimit = appOptions.GlobalRateLimitPerMinute,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));
});

// ---------------------------------------------------------------- CORS
var origins = appOptions.AllowedOrigins
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

builder.Services.AddCors(o =>
{
    o.AddPolicy("app", p =>
    {
        if (origins.Length > 0)
        {
            p.WithOrigins(origins)
             .AllowAnyHeader()
             .AllowAnyMethod()
             .AllowCredentials();
        }
        else if (builder.Environment.IsDevelopment())
        {
            p.WithOrigins("http://localhost:5173", "http://localhost:4173", "http://localhost:3000")
             .AllowAnyHeader()
             .AllowAnyMethod()
             .AllowCredentials();
        }
        // Sin orígenes configurados en producción: no se permite ningún origen cruzado.
    });
});

// ---------------------------------------------------------------- MVC / Swagger / SignalR
builder.Services.AddControllers().AddJsonOptions(o =>
{
    o.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
    o.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
});

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddResponseCompression(o => o.Providers.Add<BrotliCompressionProvider>());

builder.Services.AddSignalR();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "Puerto Taxi API", Version = "v1" });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Pega el access token."
    });
    c.AddSecurityRequirement(doc => new OpenApiSecurityRequirement
    {
        { new OpenApiSecuritySchemeReference("Bearer", doc), new List<string>() }
    });
});

builder.Services.AddHealthChecks()
    .AddCheck<SqlServerHealthCheck>("sql", tags: ["ready"]);

var app = builder.Build();

// ---------------------------------------------------------------- migraciones + seed
if (!app.Environment.IsEnvironment("Testing"))
{
    await using var scope = app.Services.CreateAsyncScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

    for (var attempt = 1; ; attempt++)
    {
        try
        {
            await db.Database.MigrateAsync();
            break;
        }
        catch (Exception ex) when (attempt < 5)
        {
            app.Logger.LogWarning(ex, "Base de datos no disponible (intento {Attempt}/5)", attempt);
            await Task.Delay(TimeSpan.FromSeconds(3));
        }
    }

    await DbSeeder.SeedAsync(scope.ServiceProvider);
}

// ---------------------------------------------------------------- pipeline
app.UseExceptionHandler();
app.UseMiddleware<SecurityHeadersMiddleware>();

if (proxyOptions.Enabled)
    app.UseForwardedHeaders();

if (!app.Environment.IsDevelopment() && !app.Environment.IsEnvironment("Testing"))
    app.UseHsts();

if (!app.Environment.IsEnvironment("Testing") &&
    builder.Configuration.GetValue("App:RequireHttps", true))
    app.UseHttpsRedirection();

app.UseResponseCompression();

// Cliente web incluido (wwwroot). En producción puede servirse aparte con su propio hosting.
app.UseDefaultFiles();
app.UseStaticFiles();

app.UseCors("app");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.MapControllers();
app.MapHub<TaxiHub>("/hubs/taxi");
app.MapHealthChecks("/health").AllowAnonymous();
app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("ready")
}).AllowAnonymous();

app.Run();

/// <summary>Necesario para que WebApplicationFactory&lt;Program&gt; funcione en las pruebas.</summary>
public partial class Program;
