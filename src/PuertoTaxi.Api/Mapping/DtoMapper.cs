using PuertoTaxi.Api.Contracts;
using PuertoTaxi.Api.Domain;

namespace PuertoTaxi.Api.Mapping;

public static class DtoMapper
{
    public static UserDto ToUserDto(this User u) => new(
        u.Id,
        MaskPhone(u.Phone),
        u.Email,
        u.FullName,
        u.Role,
        u.PhoneVerifiedAtUtc is not null,
        u.DriverProfile is null ? null : u.DriverProfile.ToDriverDto(u.FullName ?? string.Empty));

    public static DriverDto ToDriverDto(this DriverProfile d, string fullName) => new(
        d.UserId,
        fullName,
        d.LicensePlate,
        d.UnitType,
        d.CurrentZone,
        d.Status,
        d.AcceptsSinpe,
        d.AcceptsPets,
        d.MariaStyle,
        d.IsApproved,
        d.LastLat,
        d.LastLng,
        d.LastSeenUtc);

    public static TripDto ToTripDto(this Trip t) => new(
        t.Id,
        t.PassengerId,
        t.DriverId,
        t.Zone,
        t.ExactAddress,
        t.PaymentMethod.ToString(),
        t.Passenger is null ? null : MaskPhone(t.Passenger.Phone),
        t.Driver?.FullName,
        t.Driver?.DriverProfile?.LicensePlate,
        t.Status.ToString(),
        t.Price,
        t.HasPet,
        t.MariaStyle,
        t.UnitType,
        t.CreatedAtUtc,
        t.ExpiresAtUtc,
        t.AcceptedAtUtc,
        t.StartedAtUtc,
        t.CompletedAtUtc,
        t.CancelledAtUtc,
        t.CancelReason);

    public static MessageDto ToMessageDto(this TripMessage m) => new(
        m.Id, m.TripId, m.SenderId, m.SenderRole.ToString(), m.Text, m.AudioData, m.CreatedAtUtc);

    public static EmergencyDto ToEmergencyDto(this EmergencyAlert a) => new(
        a.Id,
        a.DriverId,
        a.Driver?.FullName ?? "Taxista",
        a.Driver?.DriverProfile?.LicensePlate ?? "—",
        a.TripId,
        a.Latitude,
        a.Longitude,
        a.IsActive,
        a.CreatedAtUtc,
        a.ResolvedAtUtc);

    public static AdminDriverDto ToAdminDriverDto(this User u) => new(
        u.Id,
        u.FullName ?? string.Empty,
        u.Phone,
        u.Email ?? string.Empty,
        u.DriverProfile?.LicensePlate ?? string.Empty,
        u.DriverProfile?.UnitType ?? string.Empty,
        u.DriverProfile?.CurrentZone ?? string.Empty,
        u.DriverProfile?.Status ?? DriverStatus.Offline,
        u.DriverProfile?.IsApproved ?? false,
        u.IsActive,
        u.CreatedAtUtc,
        u.LastLoginAtUtc);

    /// <summary>Muestra solo los últimos 4 dígitos: "******1234".</summary>
    public static string MaskPhone(string? phone)
    {
        if (string.IsNullOrWhiteSpace(phone)) return string.Empty;
        var digits = new string(phone.Where(char.IsDigit).ToArray());
        return digits.Length <= 4 ? "****" : new string('*', digits.Length - 4) + digits[^4..];
    }
}
