namespace PuertoTaxi.Api.Domain;

public enum UserRole
{
    Passenger = 0,
    Driver = 1,
    Admin = 2
}

public enum DriverStatus
{
    Offline = 0,
    Available = 1,
    OnTrip = 2
}

public enum TripStatus
{
    Pending = 0,
    Accepted = 1,
    InProgress = 2,
    Completed = 3,
    Cancelled = 4
}

public enum PaymentMethod
{
    Sinpe = 0,
    Cash = 1
}

public enum MessageSenderRole
{
    Passenger = 0,
    Driver = 1
}
