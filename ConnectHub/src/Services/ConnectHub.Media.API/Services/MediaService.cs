using ConnectHub.Media.API.DTOs;
using ConnectHub.Media.API.Models;
using ConnectHub.Media.API.Repositories;

namespace ConnectHub.Media.API.Services;

public class MediaService : IMediaService
{
    private readonly IMediaRepository _repo;
    private readonly ICloudinaryService _cloudinary;
    private readonly ILogger<MediaService> _logger;

    // File size limits
    private const long MaxImageSizeBytes = 10 * 1024 * 1024;   // 10 MB
    private const long MaxDocumentSizeBytes = 50 * 1024 * 1024; // 50 MB
    private const long MaxAudioSizeBytes = 25 * 1024 * 1024;    // 25 MB

    // Allowed file types
    private static readonly HashSet<string> AllowedImageTypes = new()
    {
        "image/jpeg", "image/png", "image/gif",
        "image/webp", "image/svg+xml"
    };

    private static readonly HashSet<string> AllowedDocumentTypes = new()
    {
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain"
    };

    private static readonly HashSet<string> AllowedAudioTypes = new()
    {
        "audio/mpeg", "audio/wav",
        "audio/ogg", "audio/mp4"
    };

    public MediaService(
        IMediaRepository repo,
        ICloudinaryService cloudinary,
        ILogger<MediaService> logger)
    {
        _repo = repo;
        _cloudinary = cloudinary;
        _logger = logger;
    }

    public async Task<UploadResponseDto> UploadFileAsync(
        IFormFile file,
        int uploadedBy,
        int? messageId,
        int? roomId,
        bool isPermanent)
    {
        // Validation
        ValidateFile(file);

        // Folder decide karo — image/audio/document
        var folder = GetFolder(file.ContentType);

        // Cloudinary par upload karo
        var uploadResult = await _cloudinary.UploadAsync(file, folder);

        // DB mein save karo
        var mediaFile = new MediaFile
        {
            UploadedBy = uploadedBy,
            FileName = file.FileName,
            ContentType = file.ContentType,
            FileSizeKb = uploadResult.FileSizeKb,
            PublicUrl = uploadResult.PublicUrl,
            CloudinaryPublicId = uploadResult.PublicId,
            ThumbnailUrl = uploadResult.ThumbnailUrl,
            MessageId = messageId,
            RoomId = roomId,
            // Permanent nahi hai toh 30 din baad expire
            ExpiresAt = isPermanent ? null : DateTime.UtcNow.AddDays(30)
        };

        var created = await _repo.CreateAsync(mediaFile);

        _logger.LogInformation(
            "File upload successful: {FileName} by User {UserId}",
            file.FileName, uploadedBy);

        return new UploadResponseDto
        {
            FileId = created.FileId,
            FileName = created.FileName,
            ContentType = created.ContentType,
            FileSizeKb = created.FileSizeKb,
            PublicUrl = created.PublicUrl,
            ThumbnailUrl = created.ThumbnailUrl,
            CloudinaryPublicId = created.CloudinaryPublicId,
            UploadedAt = created.UploadedAt
        };
    }

    public async Task<MediaFileResponseDto?> GetFileByIdAsync(Guid fileId)
    {
        var file = await _repo.FindByIdAsync(fileId);
        return file is null ? null : MapToDto(file);
    }

    public async Task<IList<MediaFileResponseDto>> GetFilesByUserAsync(int userId)
    {
        var files = await _repo.FindByUploadedByAsync(userId);
        return files.Select(MapToDto).ToList();
    }

    public async Task<IList<MediaFileResponseDto>> GetFilesByRoomAsync(int roomId)
    {
        var files = await _repo.FindByRoomIdAsync(roomId);
        return files.Select(MapToDto).ToList();
    }

    public async Task<bool> DeleteFileAsync(Guid fileId)
    {
        var file = await _repo.FindByIdAsync(fileId);
        if (file is null) return false;

        // Cloudinary se bhi delete karo
        await _cloudinary.DeleteAsync(file.CloudinaryPublicId);

        // DB mein soft delete karo
        return await _repo.SoftDeleteAsync(fileId);
    }

    public async Task<MediaStatsDto> GetStatsAsync() =>
        await _repo.GetStatsAsync();

    // ── Private helpers ───────────────────────────────────────────

    private static void ValidateFile(IFormFile file)
    {
        if (file.Length == 0)
            throw new ArgumentException("File khali hai.");

        var contentType = file.ContentType.ToLower();

        if (AllowedImageTypes.Contains(contentType))
        {
            if (file.Length > MaxImageSizeBytes)
                throw new ArgumentException("Image 10MB se badi nahi honi chahiye.");
        }
        else if (AllowedDocumentTypes.Contains(contentType))
        {
            if (file.Length > MaxDocumentSizeBytes)
                throw new ArgumentException("Document 50MB se bada nahi hona chahiye.");
        }
        else if (AllowedAudioTypes.Contains(contentType))
        {
            if (file.Length > MaxAudioSizeBytes)
                throw new ArgumentException("Audio 25MB se bada nahi hona chahiye.");
        }
        else
        {
            throw new ArgumentException(
                $"File type allowed nahi hai: {contentType}");
        }
    }

    private static string GetFolder(string contentType) =>
        contentType switch
        {
            var t when t.StartsWith("image/") => "images",
            var t when t.StartsWith("audio/") => "audio",
            _ => "documents"
        };

    private static MediaFileResponseDto MapToDto(MediaFile m) => new()
    {
        FileId = m.FileId,
        UploadedBy = m.UploadedBy,
        FileName = m.FileName,
        ContentType = m.ContentType,
        FileSizeKb = m.FileSizeKb,
        PublicUrl = m.PublicUrl,
        ThumbnailUrl = m.ThumbnailUrl,
        MessageId = m.MessageId,
        RoomId = m.RoomId,
        UploadedAt = m.UploadedAt,
        ExpiresAt = m.ExpiresAt
    };
}