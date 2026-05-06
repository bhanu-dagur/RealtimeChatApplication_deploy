namespace ConnectHub.Media.API.DTOs;

public class UploadResponseDto
{
    public Guid FileId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long FileSizeKb { get; set; }
    public string PublicUrl { get; set; } = string.Empty;
    public string? ThumbnailUrl { get; set; }
    public string CloudinaryPublicId { get; set; } = string.Empty;
    public DateTime UploadedAt { get; set; }
}