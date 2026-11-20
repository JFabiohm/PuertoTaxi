using FluentValidation;
using PuertoTaxi.Api.Contracts;

namespace PuertoTaxi.Api.Validation;

/// <summary>Zonas oficiales. Se valida contra lista blanca para no aceptar texto arbitrario.</summary>
public static class Zones
{
    public static readonly string[] All =
    [
        "Barrio El Carmen",
        "Puntarenas Centro",
        "El Cocal",
        "La Gran Chacarita",
        "El Boli",
        "Ant. Hospital y alrededores",
        "Caldera",
        "El Roble-Jireth",
        "Alrededores de Plamas-JuanitoMora",
        "Doña Cecilia-Almedros-Santa Rosa",
        "Feria-BarrrancaCentro-Cruce",
        "Costanera-Reseda-Chaguite"
    ];

    public static bool IsValid(string? zone) =>
        !string.IsNullOrWhiteSpace(zone) && All.Contains(zone.Trim(), StringComparer.Ordinal);
}

public sealed class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    public LoginRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().MaximumLength(160).EmailAddress();
        RuleFor(x => x.Password).NotEmpty().MinimumLength(8).MaximumLength(128);
    }
}

public sealed class OtpRequestValidator : AbstractValidator<OtpRequestDto>
{
    public OtpRequestValidator()
    {
        RuleFor(x => x.Phone)
            .NotEmpty()
            .Must(p => Digits(p).Length is >= 8 and <= 15)
            .WithMessage("El teléfono debe tener entre 8 y 15 dígitos.");
    }

    internal static string Digits(string? s) => new((s ?? string.Empty).Where(char.IsDigit).ToArray());
}

public sealed class OtpVerifyValidator : AbstractValidator<OtpVerifyRequest>
{
    public OtpVerifyValidator()
    {
        RuleFor(x => x.Phone)
            .NotEmpty()
            .Must(p => OtpRequestValidator.Digits(p).Length is >= 8 and <= 15)
            .WithMessage("El teléfono debe tener entre 8 y 15 dígitos.");
        RuleFor(x => x.Code).NotEmpty().Matches(@"^\d{6}$").WithMessage("El código debe tener 6 dígitos.");
    }
}

public sealed class CreateTripValidator : AbstractValidator<CreateTripRequest>
{
    public CreateTripValidator()
    {
        RuleFor(x => x.Zone)
            .NotEmpty()
            .Must(Zones.IsValid)
            .WithMessage("Zona no válida.");

        RuleFor(x => x.ExactAddress)
            .NotEmpty()
            .MaximumLength(250)
            .Must(Text.NoControlChars).WithMessage("La dirección contiene caracteres no permitidos.");

        RuleFor(x => x.PaymentMethod).IsInEnum();
        RuleFor(x => x.MariaStyle).MaximumLength(60).Must(Text.NoControlChars)
            .When(x => x.MariaStyle is not null);
        RuleFor(x => x.UnitType).MaximumLength(20).Must(Text.NoControlChars)
            .When(x => x.UnitType is not null);
    }
}

public sealed class SendMessageValidator : AbstractValidator<SendMessageRequest>
{
    public SendMessageValidator()
    {
        RuleFor(x => x)
            .Must(x => !string.IsNullOrWhiteSpace(x.Text) || !string.IsNullOrWhiteSpace(x.AudioData))
            .WithMessage("El mensaje debe tener texto o audio.");

        RuleFor(x => x.Text)
            .MaximumLength(1000)
            .Must(Text.NoControlChars)
            .When(x => x.Text is not null);

        RuleFor(x => x.AudioData)
            .MaximumLength(350_000)
            .WithMessage("El audio excede el tamaño máximo permitido.")
            .Must(a => a is null || a.StartsWith("data:audio/") || IsBase64(a))
            .WithMessage("Formato de audio inválido.");
    }

    private static bool IsBase64(string s)
    {
        Span<byte> buffer = new byte[s.Length];
        return Convert.TryFromBase64String(s, buffer, out _);
    }
}

public sealed class CreateEmergencyValidator : AbstractValidator<CreateEmergencyRequest>
{
    public CreateEmergencyValidator()
    {
        RuleFor(x => x.Latitude).InclusiveBetween(-90m, 90m);
        RuleFor(x => x.Longitude).InclusiveBetween(-180m, 180m);
        RuleFor(x => x.Note).MaximumLength(300).Must(Text.NoControlChars).When(x => x.Note is not null);
    }
}

public sealed class PassengerEmergencyValidator : AbstractValidator<PassengerEmergencyRequest>
{
    public PassengerEmergencyValidator()
    {
        RuleFor(x => x.Latitude).InclusiveBetween(-90m, 90m);
        RuleFor(x => x.Longitude).InclusiveBetween(-180m, 180m);
        RuleFor(x => x.Description).NotEmpty().MaximumLength(1000).Must(Text.NoControlChars);
    }
}

public sealed class CreateDriverValidator : AbstractValidator<CreateDriverRequest>
{
    public CreateDriverValidator()
    {
        RuleFor(x => x.FullName).NotEmpty().MaximumLength(120).Must(Text.NoControlChars);
        RuleFor(x => x.Phone)
            .NotEmpty()
            .Must(p => OtpRequestValidator.Digits(p).Length is >= 8 and <= 15)
            .WithMessage("El teléfono debe tener entre 8 y 15 dígitos.");
        RuleFor(x => x.Email).NotEmpty().MaximumLength(160).EmailAddress();
        RuleFor(x => x.Password).NotEmpty().MinimumLength(10).MaximumLength(128)
            .Matches("[A-Z]").WithMessage("Debe incluir al menos una mayúscula.")
            .Matches("[0-9]").WithMessage("Debe incluir al menos un número.");
        RuleFor(x => x.LicensePlate).NotEmpty().MaximumLength(12).Matches(@"^[A-Za-z0-9\- ]+$");
        RuleFor(x => x.UnitType).NotEmpty().MaximumLength(20);
        RuleFor(x => x.CurrentZone).NotEmpty().MaximumLength(60);
    }
}

public sealed class UpdateDriverValidator : AbstractValidator<UpdateDriverRequest>
{
    public UpdateDriverValidator()
    {
        RuleFor(x => x.FullName).MaximumLength(120).Must(Text.NoControlChars).When(x => x.FullName is not null);
        RuleFor(x => x.Phone)
            .Must(p => OtpRequestValidator.Digits(p).Length is >= 8 and <= 15)
            .WithMessage("El teléfono debe tener entre 8 y 15 dígitos.")
            .When(x => x.Phone is not null);
        RuleFor(x => x.Email).MaximumLength(160).EmailAddress().When(x => x.Email is not null);
        RuleFor(x => x.UnitType).MaximumLength(20).When(x => x.UnitType is not null);
        RuleFor(x => x.CurrentZone).MaximumLength(60).When(x => x.CurrentZone is not null);
    }
}

public sealed class CompleteTripValidator : AbstractValidator<CompleteTripRequest>
{
    public CompleteTripValidator()
    {
        RuleFor(x => x.Price).InclusiveBetween(0m, 100_000m).When(x => x.Price is not null);
    }
}

public static class Text
{
    /// <summary>Rechaza caracteres de control (incluye NUL, saltos raros y escapes).</summary>
    public static bool NoControlChars(string? s) =>
        s is null || !s.Any(char.IsControl);
}
