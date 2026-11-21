using PuertoTaxi.Api.Domain;

namespace PuertoTaxi.Api.Contracts;

// ============================ AUTH ============================

public sealed record LoginRequest(string Email, string Password);

public sealed record OtpRequestDto(string Phone);

public sealed record OtpVerifyRequest(string Phone, string Code);

public sealed record RefreshRequest(string? RefreshToken);

public sealed record AuthResponse(
    string AccessToken,
    DateTime AccessTokenExpiresAtUtc,
    string RefreshToken,
    DateTime RefreshTokenExpiresAtUtc,
    UserDto User);

// ============================ USUARIOS ============================

public sealed record UserDto(
    Guid Id,
    string Phone,
    string? Email,
    string? FullName,
    UserRole Role,
    bool PhoneVerified,
    DriverDto? Driver);

public sealed record UpdateMeRequest(string? FullName);

public sealed record DriverDto(
    Guid Id,
    string FullName,
    string LicensePlate,
    string UnitType,
    string CurrentZone,
    DriverStatus Status,
    bool AcceptsSinpe,
    bool AcceptsPets,
    string MariaStyle,
    bool IsApproved,
    decimal? LastLat,
    decimal? LastLng,
    DateTime? LastSeenUtc);

public sealed record UpdateLocationRequest(decimal Latitude, decimal Longitude);

public sealed record UpdateDriverStatusRequest(string Status);

public sealed record UpdateDriverPreferencesRequest(
    bool? AcceptsSinpe,
    bool? AcceptsPets,
    string? MariaStyle,
    string? UnitType,
    string? CurrentZone);

/// <summary>Vista de admin: incluye contacto. Nunca incluye hash de contraseña.</summary>
public sealed record AdminDriverDto(
    Guid Id,
    string FullName,
    string Phone,
    string Email,
    string LicensePlate,
    string UnitType,
    string CurrentZone,
    DriverStatus Status,
    bool IsApproved,
    bool IsActive,
    DateTime CreatedAtUtc,
    DateTime? LastLoginAtUtc);

public sealed record AdminPassengerDto(
    string Phone,
    int TripCount,
    bool HasEmergency);

public sealed record AdminUserDto(
    Guid Id,
    string? FullName,
    string? Email,
    string Phone,
    string Role,
    bool IsActive,
    DateTime CreatedAtUtc,
    DateTime? LastLoginAtUtc);

// ============================ VIAJES ============================

public sealed record CreateTripRequest(
    string Zone,
    string ExactAddress,
    PaymentMethod PaymentMethod,
    bool HasPet,
    string? MariaStyle,
    string? UnitType);

public sealed record TripDto(
    Guid Id,
    Guid PassengerId,
    Guid? DriverId,
    string Zone,
    string ExactAddress,
    string PaymentMethod,
    string? PassengerPhoneMasked,
    string? DriverName,
    string? DriverPlate,
    string Status,
    decimal? Price,
    bool HasPet,
    string MariaStyle,
    string UnitType,
    DateTime CreatedAtUtc,
    DateTime? ExpiresAtUtc,
    DateTime? AcceptedAtUtc,
    DateTime? StartedAtUtc,
    DateTime? CompletedAtUtc,
    DateTime? CancelledAtUtc,
    string? CancelReason);

public sealed record CancelTripRequest(string? Reason);

public sealed record CompleteTripRequest(decimal? Price);

// ============================ CHAT ============================

public sealed record SendMessageRequest(string? Text, string? AudioData);

public sealed record MessageDto(
    Guid Id,
    Guid TripId,
    Guid SenderId,
    string SenderRole,
    string? Text,
    string? AudioData,
    DateTime CreatedAtUtc);

// ============================ EMERGENCIA ============================

public sealed record CreateEmergencyRequest(decimal Latitude, decimal Longitude, Guid? TripId, string? Note);

public sealed record EmergencyDto(
    Guid Id,
    Guid DriverId,
    string DriverName,
    string DriverPlate,
    Guid? TripId,
    decimal Latitude,
    decimal Longitude,
    bool IsActive,
    DateTime CreatedAtUtc,
    DateTime? ResolvedAtUtc);

public sealed record ResolveEmergencyRequest(string? Note);

public sealed record PassengerEmergencyRequest(decimal Latitude, decimal Longitude, string Description);

// ============================ ADMIN ============================

public sealed record CreateDriverRequest(
    string FullName,
    string Phone,
    string Email,
    string Password,
    string LicensePlate,
    string UnitType,
    string CurrentZone);

public sealed record UpdateDriverRequest(
    string? FullName,
    string? Phone,
    string? Email,
    string? UnitType,
    string? CurrentZone,
    bool? IsApproved,
    bool? IsActive);

public sealed record AdminStatsDto(
    int Passengers,
    int Drivers,
    int ActiveTrips,
    int PendingTrips,
    int ActiveEmergencies);
