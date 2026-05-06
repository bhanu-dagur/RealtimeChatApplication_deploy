using System.ComponentModel.DataAnnotations;

namespace ConnectHub.Media.API.Models;

public class MediaFile
{
    public Guid FileId { get; set; } = Guid.NewGuid();

    // Kisne upload kiya
    [Required]
    public int UploadedBy { get; set; }

    [Required, MaxLength(255)]
    public string FileName { get; set; } = string.Empty;

    [Required, MaxLength(100)]
    public string ContentType { get; set; } = string.Empty;

    public long FileSizeKb { get; set; }

    // Cloudinary ka public URL
    [Required]
    public string PublicUrl { get; set; } = string.Empty;

    // Cloudinary ka unique Public ID — delete ke liye zaroori
    [Required]
    public string CloudinaryPublicId { get; set; } = string.Empty;

    // Image ke liye thumbnail URL
    public string? ThumbnailUrl { get; set; }

    // Kis message se attached hai (optional)
    public int? MessageId { get; set; }

    // Kis room se attached hai (optional)
    public int? RoomId { get; set; }

    public DateTime UploadedAt { get; set; } = DateTime.UtcNow;

    // Cleanup ke liye — null ho toh permanent
    public DateTime? ExpiresAt { get; set; }

    public bool IsDeleted { get; set; } = false;
}