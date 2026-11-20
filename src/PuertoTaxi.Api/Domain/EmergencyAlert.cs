namespace PuertoTaxi.Api.Domain;

/// <summary>Alerta 10-33 (botón de pánico). Solo un chofer la genera y solo un admin la resuelve.</summary>
public class EmergencyAlert
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid DriverId { get; set; }
    public User Driver { get; set; } = null!;

    public Guid? TripId { get; set; }
    public Trip? Trip { get; set; }

    public decimal Latitude { get; set; }
    public decimal Longitude { get; set; }

    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? ResolvedAtUtc { get; set; }
    public Guid? ResolvedByUserId { get; set; }
    public string? Note { get; set; }
}
