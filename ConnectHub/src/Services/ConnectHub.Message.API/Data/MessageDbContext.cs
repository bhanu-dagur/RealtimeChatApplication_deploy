using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using ConnectHub.Message.API.Models;

namespace ConnectHub.Message.API.Data;

public class MessageDbContext : DbContext
{
    public MessageDbContext(DbContextOptions<MessageDbContext> options) : base(options) { }

    public DbSet<MessageEntity> Messages => Set<MessageEntity>();

    // Stores values as UTC; reads them back as DateTime with Kind=Utc so
    // System.Text.Json appends the trailing 'Z' on serialization.
    private static readonly ValueConverter<DateTime, DateTime> UtcConverter = new(
        toDb => toDb.Kind == DateTimeKind.Utc ? toDb : toDb.ToUniversalTime(),
        fromDb => DateTime.SpecifyKind(fromDb, DateTimeKind.Utc));

    private static readonly ValueConverter<DateTime?, DateTime?> NullableUtcConverter = new(
        toDb => toDb.HasValue
            ? (toDb.Value.Kind == DateTimeKind.Utc ? toDb : toDb.Value.ToUniversalTime())
            : (DateTime?)null,
        fromDb => fromDb.HasValue
            ? DateTime.SpecifyKind(fromDb.Value, DateTimeKind.Utc)
            : (DateTime?)null);

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<MessageEntity>(entity =>
        {
            entity.HasKey(m => m.MessageId);

            entity.Property(m => m.Content)
                  .IsRequired()
                  .HasMaxLength(2000);

            entity.Property(m => m.SentAt).HasConversion(UtcConverter);
            entity.Property(m => m.ReadAt).HasConversion(NullableUtcConverter);
            entity.Property(m => m.EditedAt).HasConversion(NullableUtcConverter);

            entity.HasIndex(m => new { m.SenderId, m.ReceiverId })
                  .HasDatabaseName("IX_Messages_Direct");

            entity.HasIndex(m => new { m.RoomId, m.SentAt })
                  .HasDatabaseName("IX_Messages_Room");

            entity.HasQueryFilter(m => !m.IsDeleted);
        });
    }

    // Belt-and-braces: force UTC on every save in case any code path bypasses
    // the converter (e.g. raw SQL with .NET DateTime fed in).
    public override int SaveChanges()
    {
        NormalizeUtc();
        return base.SaveChanges();
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        NormalizeUtc();
        return base.SaveChangesAsync(cancellationToken);
    }

    private void NormalizeUtc()
    {
        foreach (var entry in ChangeTracker.Entries<MessageEntity>())
        {
            if (entry.State is EntityState.Added or EntityState.Modified)
            {
                if (entry.Entity.SentAt.Kind != DateTimeKind.Utc)
                    entry.Entity.SentAt = DateTime.SpecifyKind(entry.Entity.SentAt, DateTimeKind.Utc);
                if (entry.Entity.ReadAt.HasValue && entry.Entity.ReadAt.Value.Kind != DateTimeKind.Utc)
                    entry.Entity.ReadAt = DateTime.SpecifyKind(entry.Entity.ReadAt.Value, DateTimeKind.Utc);
                if (entry.Entity.EditedAt.HasValue && entry.Entity.EditedAt.Value.Kind != DateTimeKind.Utc)
                    entry.Entity.EditedAt = DateTime.SpecifyKind(entry.Entity.EditedAt.Value, DateTimeKind.Utc);
            }
        }
    }
}