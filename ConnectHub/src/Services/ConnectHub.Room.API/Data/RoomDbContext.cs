using Microsoft.EntityFrameworkCore;
using ConnectHub.Room.API.Models;

namespace ConnectHub.Room.API.Data;

public class RoomDbContext : DbContext
{
    public RoomDbContext(DbContextOptions<RoomDbContext> options) : base(options) { }

    public DbSet<ChatRoom> ChatRooms => Set<ChatRoom>();
    public DbSet<RoomMember> RoomMembers => Set<RoomMember>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<ChatRoom>(entity =>
        {
            entity.HasKey(r => r.RoomId);

            entity.Property(r => r.RoomName)
                  .IsRequired()
                  .HasMaxLength(100);

            entity.HasIndex(r => r.RoomName)
                  .HasDatabaseName("IX_ChatRooms_RoomName");

            // Soft delete filter
            entity.HasQueryFilter(r => r.IsActive);

            // One room — many members
            entity.HasMany(r => r.Members)
                  .WithOne(m => m.ChatRoom)
                  .HasForeignKey(m => m.RoomId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<RoomMember>(entity =>
        {
            entity.HasKey(m => m.MemberId);

            // Ek user ek room mein sirf ek baar — duplicate nahi
            entity.HasIndex(m => new { m.RoomId, m.UserId })
                  .IsUnique()
                  .HasDatabaseName("IX_RoomMembers_RoomId_UserId");

            // Soft delete filter
            entity.HasQueryFilter(m => m.IsActive);
        });
    }
}