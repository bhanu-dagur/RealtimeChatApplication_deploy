using Microsoft.EntityFrameworkCore;
using ConnectHub.Media.API.Models;

namespace ConnectHub.Media.API.Data;

public class MediaDbContext : DbContext
{
    public MediaDbContext(DbContextOptions<MediaDbContext> options)
        : base(options) { }

    public DbSet<MediaFile> MediaFiles => Set<MediaFile>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<MediaFile>(entity =>
        {
            entity.HasKey(m => m.FileId);

            entity.Property(m => m.FileName)
                  .IsRequired()
                  .HasMaxLength(255);

            entity.Property(m => m.ContentType)
                  .IsRequired()
                  .HasMaxLength(100);

            entity.Property(m => m.PublicUrl)
                  .IsRequired();

            entity.Property(m => m.CloudinaryPublicId)
                  .IsRequired();

            // User ke files dhundhne ke liye index
            entity.HasIndex(m => m.UploadedBy)
                  .HasDatabaseName("IX_MediaFiles_UploadedBy");

            // Expired files dhundhne ke liye index
            entity.HasIndex(m => m.ExpiresAt)
                  .HasDatabaseName("IX_MediaFiles_ExpiresAt");

            // Soft delete filter
            entity.HasQueryFilter(m => !m.IsDeleted);
        });
    }
}