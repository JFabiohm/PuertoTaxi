IF OBJECT_ID(N'[__EFMigrationsHistory]') IS NULL
BEGIN
    CREATE TABLE [__EFMigrationsHistory] (
        [MigrationId] nvarchar(150) NOT NULL,
        [ProductVersion] nvarchar(32) NOT NULL,
        CONSTRAINT [PK___EFMigrationsHistory] PRIMARY KEY ([MigrationId])
    );
END;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261103183156_InitialCreate'
)
BEGIN
    CREATE TABLE [AuditLogs] (
        [Id] bigint NOT NULL IDENTITY,
        [ActorUserId] uniqueidentifier NULL,
        [Action] nvarchar(60) NOT NULL,
        [Entity] nvarchar(40) NOT NULL,
        [EntityId] nvarchar(64) NULL,
        [Ip] nvarchar(64) NULL,
        [Detail] nvarchar(500) NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        CONSTRAINT [PK_AuditLogs] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261103183156_InitialCreate'
)
BEGIN
    CREATE TABLE [OtpCodes] (
        [Id] uniqueidentifier NOT NULL,
        [Phone] nvarchar(20) NOT NULL,
        [CodeHash] nvarchar(64) NOT NULL,
        [Salt] nvarchar(64) NOT NULL,
        [Attempts] int NOT NULL,
        [ExpiresAtUtc] datetime2 NOT NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        [ConsumedAtUtc] datetime2 NULL,
        CONSTRAINT [PK_OtpCodes] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261103183156_InitialCreate'
)
BEGIN
    CREATE TABLE [Users] (
        [Id] uniqueidentifier NOT NULL,
        [Phone] nvarchar(20) NOT NULL,
        [Email] nvarchar(160) NULL,
        [PasswordHash] nvarchar(500) NULL,
        [FullName] nvarchar(120) NULL,
        [Role] nvarchar(20) NOT NULL,
        [IsActive] bit NOT NULL,
        [PhoneVerifiedAtUtc] datetime2 NULL,
        [FailedLoginCount] int NOT NULL,
        [LockoutEndUtc] datetime2 NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        [UpdatedAtUtc] datetime2 NOT NULL,
        [LastLoginAtUtc] datetime2 NULL,
        CONSTRAINT [PK_Users] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261103183156_InitialCreate'
)
BEGIN
    CREATE TABLE [DriverProfiles] (
        [UserId] uniqueidentifier NOT NULL,
        [LicensePlate] nvarchar(12) NOT NULL,
        [UnitType] nvarchar(20) NOT NULL,
        [CurrentZone] nvarchar(60) NOT NULL,
        [Status] nvarchar(20) NOT NULL,
        [LastLat] decimal(9,6) NULL,
        [LastLng] decimal(9,6) NULL,
        [LastSeenUtc] datetime2 NULL,
        [AcceptsSinpe] bit NOT NULL,
        [AcceptsPets] bit NOT NULL,
        [MariaStyle] nvarchar(60) NOT NULL,
        [IsApproved] bit NOT NULL,
        CONSTRAINT [PK_DriverProfiles] PRIMARY KEY ([UserId]),
        CONSTRAINT [FK_DriverProfiles_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [Users] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261103183156_InitialCreate'
)
BEGIN
    CREATE TABLE [RefreshTokens] (
        [Id] uniqueidentifier NOT NULL,
        [UserId] uniqueidentifier NOT NULL,
        [TokenHash] nvarchar(64) NOT NULL,
        [ExpiresAtUtc] datetime2 NOT NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        [RevokedAtUtc] datetime2 NULL,
        [ReplacedByTokenHash] nvarchar(64) NULL,
        [CreatedByIp] nvarchar(64) NULL,
        CONSTRAINT [PK_RefreshTokens] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_RefreshTokens_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [Users] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261103183156_InitialCreate'
)
BEGIN
    CREATE TABLE [Trips] (
        [Id] uniqueidentifier NOT NULL,
        [PassengerId] uniqueidentifier NOT NULL,
        [DriverId] uniqueidentifier NULL,
        [Zone] nvarchar(60) NOT NULL,
        [ExactAddress] nvarchar(250) NOT NULL,
        [PaymentMethod] nvarchar(20) NOT NULL,
        [HasPet] bit NOT NULL,
        [MariaStyle] nvarchar(60) NOT NULL,
        [UnitType] nvarchar(20) NOT NULL,
        [Status] nvarchar(20) NOT NULL,
        [Price] decimal(10,2) NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        [ExpiresAtUtc] datetime2 NULL,
        [AcceptedAtUtc] datetime2 NULL,
        [StartedAtUtc] datetime2 NULL,
        [CompletedAtUtc] datetime2 NULL,
        [CancelledAtUtc] datetime2 NULL,
        [CancelReason] nvarchar(200) NULL,
        CONSTRAINT [PK_Trips] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Trips_Users_DriverId] FOREIGN KEY ([DriverId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_Trips_Users_PassengerId] FOREIGN KEY ([PassengerId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261103183156_InitialCreate'
)
BEGIN
    CREATE TABLE [EmergencyAlerts] (
        [Id] uniqueidentifier NOT NULL,
        [DriverId] uniqueidentifier NOT NULL,
        [TripId] uniqueidentifier NULL,
        [Latitude] decimal(9,6) NOT NULL,
        [Longitude] decimal(9,6) NOT NULL,
        [IsActive] bit NOT NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        [ResolvedAtUtc] datetime2 NULL,
        [ResolvedByUserId] uniqueidentifier NULL,
        [Note] nvarchar(300) NULL,
        CONSTRAINT [PK_EmergencyAlerts] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_EmergencyAlerts_Trips_TripId] FOREIGN KEY ([TripId]) REFERENCES [Trips] ([Id]) ON DELETE SET NULL,
        CONSTRAINT [FK_EmergencyAlerts_Users_DriverId] FOREIGN KEY ([DriverId]) REFERENCES [Users] ([Id]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261103183156_InitialCreate'
)
BEGIN
    CREATE TABLE [TripMessages] (
        [Id] uniqueidentifier NOT NULL,
        [TripId] uniqueidentifier NOT NULL,
        [SenderId] uniqueidentifier NOT NULL,
        [SenderRole] nvarchar(20) NOT NULL,
        [Text] nvarchar(1000) NULL,
        [AudioData] nvarchar(max) NULL,
        [CreatedAtUtc] datetime2 NOT NULL,
        CONSTRAINT [PK_TripMessages] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_TripMessages_Trips_TripId] FOREIGN KEY ([TripId]) REFERENCES [Trips] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261103183156_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_AuditLogs_CreatedAtUtc] ON [AuditLogs] ([CreatedAtUtc]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261103183156_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_DriverProfiles_LicensePlate] ON [DriverProfiles] ([LicensePlate]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261103183156_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_DriverProfiles_Status] ON [DriverProfiles] ([Status]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261103183156_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_EmergencyAlerts_DriverId] ON [EmergencyAlerts] ([DriverId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261103183156_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_EmergencyAlerts_IsActive_CreatedAtUtc] ON [EmergencyAlerts] ([IsActive], [CreatedAtUtc]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261103183156_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_EmergencyAlerts_TripId] ON [EmergencyAlerts] ([TripId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261103183156_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_OtpCodes_Phone_CreatedAtUtc] ON [OtpCodes] ([Phone], [CreatedAtUtc]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261103183156_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_RefreshTokens_TokenHash] ON [RefreshTokens] ([TokenHash]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261103183156_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_RefreshTokens_UserId_ExpiresAtUtc] ON [RefreshTokens] ([UserId], [ExpiresAtUtc]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261103183156_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_TripMessages_TripId_CreatedAtUtc] ON [TripMessages] ([TripId], [CreatedAtUtc]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261103183156_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Trips_DriverId] ON [Trips] ([DriverId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261103183156_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Trips_PassengerId] ON [Trips] ([PassengerId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261103183156_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Trips_Status_CreatedAtUtc] ON [Trips] ([Status], [CreatedAtUtc]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261103183156_InitialCreate'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_Users_Email] ON [Users] ([Email]) WHERE [Email] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261103183156_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Users_Phone] ON [Users] ([Phone]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261103183156_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Users_Role] ON [Users] ([Role]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261103183156_InitialCreate'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261103183156_InitialCreate', N'10.0.14');
END;

COMMIT;
GO

