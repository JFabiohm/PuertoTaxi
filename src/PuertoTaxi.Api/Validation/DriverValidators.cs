using FluentValidation;
using PuertoTaxi.Api.Contracts;
using PuertoTaxi.Api.Domain;

namespace PuertoTaxi.Api.Validation;

public sealed class UpdateLocationValidator : AbstractValidator<UpdateLocationRequest>
{
    public UpdateLocationValidator()
    {
        RuleFor(x => x.Latitude).InclusiveBetween(-90m, 90m);
        RuleFor(x => x.Longitude).InclusiveBetween(-180m, 180m);
    }
}

public sealed class UpdateDriverStatusValidator : AbstractValidator<UpdateDriverStatusRequest>
{
    public UpdateDriverStatusValidator()
    {
        RuleFor(x => x.Status)
            .NotEmpty()
            .Must(s => s is "Available" or "Offline")
            .WithMessage("Solo puedes cambiar entre Available y Offline. OnTrip lo controla el servidor.");
    }
}

public sealed class UpdateDriverPreferencesValidator : AbstractValidator<UpdateDriverPreferencesRequest>
{
    public UpdateDriverPreferencesValidator()
    {
        RuleFor(x => x.MariaStyle).MaximumLength(60).Must(Text.NoControlChars).When(x => x.MariaStyle is not null);
        RuleFor(x => x.UnitType).MaximumLength(20).Must(Text.NoControlChars).When(x => x.UnitType is not null);
        RuleFor(x => x.CurrentZone).MaximumLength(60).Must(Text.NoControlChars).When(x => x.CurrentZone is not null);
    }
}

public sealed class UpdateMeValidator : AbstractValidator<UpdateMeRequest>
{
    public UpdateMeValidator()
    {
        RuleFor(x => x.FullName).MaximumLength(120).Must(Text.NoControlChars).When(x => x.FullName is not null);
    }
}
