using System.Collections.Concurrent;

namespace PuertoTaxi.Api.Services;

public interface ISmsSender
{
    Task SendAsync(string phone, string message, CancellationToken ct);
}

/// <summary>Desarrollo: escribe el SMS en el log. Nunca debe usarse en producción.</summary>
public sealed class LogSmsSender(ILogger<LogSmsSender> logger, IHostEnvironment env) : ISmsSender
{
    public Task SendAsync(string phone, string message, CancellationToken ct)
    {
        if (!env.IsDevelopment())
            throw new InvalidOperationException(
                "No hay proveedor de SMS configurado (Sms:WebhookUrl). No se puede enviar el código en producción.");

        logger.LogInformation("[SMS-DEV] {Phone} -> {Message}", phone, message);
        return Task.CompletedTask;
    }
}

/// <summary>Producción: POST a un webhook (Twilio, Meta, proveedor local, etc.).</summary>
public sealed class WebhookSmsSender(HttpClient http, IConfiguration config, ILogger<WebhookSmsSender> logger) : ISmsSender
{
    public async Task SendAsync(string phone, string message, CancellationToken ct)
    {
        var url = config["Sms:WebhookUrl"];
        if (string.IsNullOrWhiteSpace(url))
            throw new InvalidOperationException("Sms:WebhookUrl no está configurado.");

        var token = config["Sms:Token"];
        using var req = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = JsonContent.Create(new { to = phone, message })
        };
        if (!string.IsNullOrWhiteSpace(token))
            req.Headers.Authorization = new("Bearer", token);

        using var res = await http.SendAsync(req, ct);
        if (!res.IsSuccessStatusCode)
        {
            logger.LogError("Proveedor SMS respondió {Status}", (int)res.StatusCode);
            throw new InvalidOperationException("No se pudo enviar el SMS.");
        }
    }
}

/// <summary>Solo pruebas: guarda los SMS en memoria para poder leer el OTP.</summary>
public sealed class CapturingSmsSender : ISmsSender
{
    private readonly ConcurrentQueue<(string Phone, string Message)> _messages = new();

    public IReadOnlyCollection<(string Phone, string Message)> Messages => _messages;

    public Task SendAsync(string phone, string message, CancellationToken ct)
    {
        _messages.Enqueue((phone, message));
        return Task.CompletedTask;
    }

    public string? LastCodeFor(string phone)
    {
        var msg = _messages.LastOrDefault(m => m.Phone == phone).Message;
        if (string.IsNullOrEmpty(msg)) return null;
        var digits = new string(msg.Where(char.IsDigit).ToArray());
        return digits.Length >= 6 ? digits[..6] : null;
    }
}
