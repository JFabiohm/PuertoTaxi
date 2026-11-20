using Microsoft.EntityFrameworkCore;
using PuertoTaxi.Api.Domain;

namespace PuertoTaxi.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<DriverProfile> DriverProfiles => Set<DriverProfile>();
    public DbSet<Trip> Trips => Set<Trip>();
    public DbSet<TripMessage> TripMessages => Set<TripMessage>();
    public DbSet<EmergencyAlert> EmergencyAlerts => Set<EmergencyAlert>();
    public DbSet<OtpCode> OtpCodes => Set<OtpCode>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<User>(e =>
        {
            e.ToTable("Users");
            e.HasKey(x => x.Id);
            e.Property(x => x.Phone).HasMaxLength(20).IsRequired();
            e.Property(x => x.Email).HasMaxLength(160);
            e.Property(x => x.FullName).HasMaxLength(120);
            e.Property(x => x.PasswordHash).HasMaxLength(500);
            e.Property(x => x.Role).HasConversion<string>().HasMaxLength(20);

            // Un teléfono = una cuenta. El email es único cuando existe.
            e.HasIndex(x => x.Phone).IsUnique();
            e.HasIndex(x => x.Email).IsUnique().HasFilter("[Email] IS NOT NULL");
            e.HasIndex(x => x.Role);

            e.HasOne(x => x.DriverProfile)
             .WithOne(x => x.User)
             .HasForeignKey<DriverProfile>(x => x.UserId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<DriverProfile>(e =>
        {
            e.ToTable("DriverProfiles");
            e.HasKey(x => x.UserId);
            e.Property(x => x.LicensePlate).HasMaxLength(12).IsRequired();
            e.Property(x => x.UnitType).HasMaxLength(20).IsRequired();
            e.Property(x => x.CurrentZone).HasMaxLength(60).IsRequired();
            e.Property(x => x.MariaStyle).HasMaxLength(60).IsRequired();
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.LastLat).HasPrecision(9, 6);
            e.Property(x => x.LastLng).HasPrecision(9, 6);

            e.HasIndex(x => x.LicensePlate).IsUnique();
            e.HasIndex(x => x.Status);
        });

        b.Entity<Trip>(e =>
        {
            e.ToTable("Trips");
            e.HasKey(x => x.Id);
            e.Property(x => x.Zone).HasMaxLength(60).IsRequired();
            e.Property(x => x.ExactAddress).HasMaxLength(250).IsRequired();
            e.Property(x => x.UnitType).HasMaxLength(20).IsRequired();
            e.Property(x => x.MariaStyle).HasMaxLength(60).IsRequired();
            e.Property(x => x.PaymentMethod).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.Price).HasPrecision(10, 2);
            e.Property(x => x.CancelReason).HasMaxLength(200);

            e.HasIndex(x => new { x.Status, x.CreatedAtUtc });
            e.HasIndex(x => x.PassengerId);
            e.HasIndex(x => x.DriverId);

            e.HasOne(x => x.Passenger)
             .WithMany()
             .HasForeignKey(x => x.PassengerId)
             .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(x => x.Driver)
             .WithMany()
             .HasForeignKey(x => x.DriverId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<TripMessage>(e =>
        {
            e.ToTable("TripMessages");
            e.HasKey(x => x.Id);
            e.Property(x => x.Text).HasMaxLength(1000);
            e.Property(x => x.AudioData).HasMaxLength(350_000); // ~256 KB en base64
            e.Property(x => x.SenderRole).HasConversion<string>().HasMaxLength(20);

            e.HasIndex(x => new { x.TripId, x.CreatedAtUtc });

            e.HasOne(x => x.Trip)
             .WithMany(x => x.Messages)
             .HasForeignKey(x => x.TripId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<EmergencyAlert>(e =>
        {
            e.ToTable("EmergencyAlerts");
            e.HasKey(x => x.Id);
            e.Property(x => x.Latitude).HasPrecision(9, 6);
            e.Property(x => x.Longitude).HasPrecision(9, 6);
            e.Property(x => x.Note).HasMaxLength(300);
            e.HasIndex(x => new { x.IsActive, x.CreatedAtUtc });

            e.HasOne(x => x.Driver)
             .WithMany()
             .HasForeignKey(x => x.DriverId)
             .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(x => x.Trip)
             .WithMany()
             .HasForeignKey(x => x.TripId)
             .OnDelete(DeleteBehavior.SetNull);
        });

        b.Entity<OtpCode>(e =>
        {
            e.ToTable("OtpCodes");
            e.HasKey(x => x.Id);
            e.Property(x => x.Phone).HasMaxLength(20).IsRequired();
            e.Property(x => x.CodeHash).HasMaxLength(64).IsRequired();
            e.Property(x => x.Salt).HasMaxLength(64).IsRequired();
            e.HasIndex(x => new { x.Phone, x.CreatedAtUtc });
        });

        b.Entity<RefreshToken>(e =>
        {
            e.ToTable("RefreshTokens");
            e.HasKey(x => x.Id);
            e.Property(x => x.TokenHash).HasMaxLength(64).IsRequired();
            e.Property(x => x.ReplacedByTokenHash).HasMaxLength(64);
            e.Property(x => x.CreatedByIp).HasMaxLength(64);
            e.HasIndex(x => x.TokenHash).IsUnique();
            e.HasIndex(x => new { x.UserId, x.ExpiresAtUtc });

            e.HasOne(x => x.User)
             .WithMany()
             .HasForeignKey(x => x.UserId)
             .OnDelete(DeleteBehavior.Cascade);

            e.Ignore(x => x.IsActive);
        });

        b.Entity<AuditLog>(e =>
        {
            e.ToTable("AuditLogs");
            e.HasKey(x => x.Id);
            e.Property(x => x.Action).HasMaxLength(60).IsRequired();
            e.Property(x => x.Entity).HasMaxLength(40).IsRequired();
            e.Property(x => x.EntityId).HasMaxLength(64);
            e.Property(x => x.Ip).HasMaxLength(64);
            e.Property(x => x.Detail).HasMaxLength(500);
            e.HasIndex(x => x.CreatedAtUtc);
        });
    }
}
