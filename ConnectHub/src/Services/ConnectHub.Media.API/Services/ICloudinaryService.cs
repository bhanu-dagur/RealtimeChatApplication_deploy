using Microsoft.AspNetCore.Http;

namespace ConnectHub.Media.API.Services;

public interface ICloudinaryService
{
    Task<CloudinaryUploadResult> UploadAsync(IFormFile file, string folder);
    Task<bool> DeleteAsync(string publicId);
    string GetThumbnailUrl(string publicId, int width = 200, int height = 200);
}

public class CloudinaryUploadResult
{
    public string PublicId { get; set; } = string.Empty;
    public string PublicUrl { get; set; } = string.Empty;
    public string? ThumbnailUrl { get; set; }
    public long FileSizeKb { get; set; }
    public string ContentType { get; set; } = string.Empty;
}