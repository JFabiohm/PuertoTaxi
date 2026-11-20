using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using PuertoTaxi.Api.Configuration;

namespace PuertoTaxi.Api.Services;

public interface IWhatsAppSender
{
    bool IsConfigured { get; }
    bool IsOtpConfigured { get; }
    Task SendPassengerEmergencyAsync(string description, decimal latitude, decimal longitude, CancellationToken ct);
    Task SendOtpAsync(string phone, string code, CancellationToken ct);
}

public sealed class WhatsAppSender(
    HttpClient httpClient,
    IOptions<WhatsAppOptions> options,
    ILogger<WhatsAppSender> logger) : IWhatsAppSender
{
    public bool IsConfigured => options.Value.IsConfigured;
    public bool IsOtpConfigured => options.Value.IsOtpConfigured;

    public async Task SendPassengerEmergencyAsync(
        string description,
        decimal latitude,
        decimal longitude,
        CancellationToken ct)
    {
        var settings = options.Value;
        if (!settings.IsConfigured)
            throw new InvalidOperationException("WhatsApp Cloud API no está configurada.");

        var url = $"https://graph.facebook.com/{settings.GraphApiVersion}/{settings.PhoneNumberId}/messages";
        using var request = new HttpRequestMessage(HttpMethod.Post, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", settings.AccessToken);
        request.Content = JsonContent.Create(new WhatsAppMessage(
            "whatsapp",
            settings.CentralPhoneNumber,
            "text",
            new WhatsAppText($"EMERGENCIA DE PASAJERO\nDescripción: {description}\nUbicación: https://maps.google.com/?q={latitude.ToString(System.Globalization.CultureInfo.InvariantCulture)},{longitude.ToString(System.Globalization.CultureInfo.InvariantCulture)}")));

        using var response = await httpClient.SendAsync(request, ct);
        if (response.IsSuccessStatusCode)
            return;

        logger.LogWarning("WhatsApp Cloud API rechazó una emergencia. Código HTTP: {StatusCode}", response.StatusCode);
        throw new HttpRequestException("WhatsApp no pudo recibir la emergencia.", null, response.StatusCode);
    }

    public async Task SendOtpAsync(string phone, string code, CancellationToken ct)
    {
        var settings = options.Value;
        if (!settings.IsConfigured)
            throw new InvalidOperationException("WhatsApp Cloud API no está configurada.");

        var url = $"https://graph.facebook.com/{settings.GraphApiVersion}/{settings.PhoneNumberId}/messages";
        using var request = new HttpRequestMessage(HttpMethod.Post, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", settings.AccessToken);
        request.Content = JsonContent.Create(new WhatsAppTemplateMessage(
            "whatsapp",
            phone,
            "template",
            new WhatsAppTemplate(settings.OtpTemplateName, new WhatsAppTemplateLanguage(settings.OtpTemplateLanguage),
                [new WhatsAppTemplateComponent("body", [new WhatsAppTemplateParameter("text", code)])])));

        using var response = await httpClient.SendAsync(request, ct);
        if (response.IsSuccessStatusCode)
            return;

        logger.LogWarning("WhatsApp Cloud API rechazó el OTP. Código HTTP: {StatusCode}", response.StatusCode);
        throw new HttpRequestException("WhatsApp no pudo enviar el código.", null, response.StatusCode);
    }

    private sealed record WhatsAppMessage(
        [property: JsonPropertyName("messaging_product")] string MessagingProduct,
        string To,
        string Type,
        WhatsAppText Text);

    private sealed record WhatsAppText(string Body);

    private sealed record WhatsAppTemplateMessage(
        [property: JsonPropertyName("messaging_product")] string MessagingProduct,
        string To,
        string Type,
        WhatsAppTemplate Template);

    private sealed record WhatsAppTemplate(
        string Name,
        WhatsAppTemplateLanguage Language,
        IReadOnlyList<WhatsAppTemplateComponent> Components);

    private sealed record WhatsAppTemplateLanguage(
        [property: JsonPropertyName("code")] string Code);

    private sealed record WhatsAppTemplateComponent(
        string Type,
        IReadOnlyList<WhatsAppTemplateParameter> Parameters);

    private sealed record WhatsAppTemplateParameter(
        string Type,
        string Text);
}