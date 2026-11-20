namespace PuertoTaxi.Api.Domain;

/// <summary>Datos operativos del taxista. 1:1 con <see cref="User"/>.</summary>
public class DriverProfile
{
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public string LicensePlate { get; set; } = string.Empty;
    public string UnitType { get; set; } = "SEDAN";
    public string CurrentZone { get; set; } = "Puntarenas Centro";
    public DriverStatus Status { get; set; } = DriverStatus.Offline;

    public decimal? LastLat { get; set; }
    public decimal? LastLng { get; set; }
    public DateTime? LastSeenUtc { get; set; }

    public bool AcceptsSinpe { get; set; }
    public bool AcceptsPets { get; set; }
    public string MariaStyle { get; set; } = "TIQUETE Y FECHA AL DIA";

    /// <summary>Un admin debe aprobar la cuenta antes de que pueda tomar viajes.</summary>
    public bool IsApproved { get; set; }
}
