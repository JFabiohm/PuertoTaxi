namespace PuertoTaxi.Api.Domain;

public class TripMessage
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid TripId { get; set; }
    public Trip Trip { get; set; } = null!;

    public Guid SenderId { get; set; }
    public MessageSenderRole SenderRole { get; set; }

    /// <summary>Texto del mensaje. Se valida longitud máxima en el endpoint y en el validador.</summary>
    public string? Text { get; set; }

    /// <summary>Audio opcional en base64 (máx. 256 KB ya codificado). Nunca se acepta sin límite.</summary>
    public string? AudioData { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
