namespace PuertoTaxi.Api.Domain;

public class Trip
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid PassengerId { get; set; }
    public User Passenger { get; set; } = null!;

    public Guid? DriverId { get; set; }
    public User? Driver { get; set; }

    public string Zone { get; set; } = string.Empty;
    public string ExactAddress { get; set; } = string.Empty;
    public PaymentMethod PaymentMethod { get; set; } = PaymentMethod.Sinpe;
    public bool HasPet { get; set; }
    public string MariaStyle { get; set; } = "TIQUETE Y FECHA AL DIA";
    public string UnitType { get; set; } = "CUALQUIERA";

    public TripStatus Status { get; set; } = TripStatus.Pending;
    public decimal? Price { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? ExpiresAtUtc { get; set; }
    public DateTime? AcceptedAtUtc { get; set; }
    public DateTime? StartedAtUtc { get; set; }
    public DateTime? CompletedAtUtc { get; set; }
    public DateTime? CancelledAtUtc { get; set; }
    public string? CancelReason { get; set; }

    public ICollection<TripMessage> Messages { get; set; } = new List<TripMessage>();
}
