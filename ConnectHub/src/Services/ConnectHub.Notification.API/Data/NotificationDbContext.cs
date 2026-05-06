using Microsoft.EntityFrameworkCore;
using ConnectHub.Notification.API.Models;

namespace ConnectHub.Notification.API.Data;

public class NotificationDbContext : DbContext
{
    public NotificationDbContext(DbContextOptions<NotificationDbContext> options)
        : base(options) { }

    public DbSet<NotificationEntity> Notifications => Set<NotificationEntity>();
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<NotificationEntity>(entity =>
        {
            entity.HasKey(n => n.NotificationId);

            entity.Property(n => n.Title)
                  .IsRequired()
                  .HasMaxLength(200);

            entity.Property(n => n.Message)
                  .IsRequired()
                  .HasMaxLength(1000);

            // RecipientId se fast query ke liye index
            entity.HasIndex(n => n.RecipientId)
                  .HasDatabaseName("IX_Notifications_RecipientId");

            // Unread notifications ke liye index
            entity.HasIndex(n => new { n.RecipientId, n.IsRead })
                  .HasDatabaseName("IX_Notifications_RecipientId_IsRead");
        });
    }
}