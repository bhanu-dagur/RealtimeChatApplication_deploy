using CloudinaryDotNet;
using CloudinaryDotNet.Actions;
using Microsoft.AspNetCore.Http;
using ConnectHub.Media.API.Options;
using Microsoft.Extensions.Options;

namespace ConnectHub.Media.API.Services;

public class CloudinaryService : ICloudinaryService
{
    private readonly Cloudinary _cloudinary;
    private readonly ILogger<CloudinaryService> _logger;

    public CloudinaryService(
        IOptions<CloudinaryOptions> options,
        ILogger<CloudinaryService> logger)
    {
        _logger = logger;

        var opt = options.Value;

        // Cloudinary initialize karo
        var account = new Account(
            opt.CloudName,
            opt.ApiKey,
            opt.ApiSecret);

        _cloudinary = new Cloudinary(account);
        _cloudinary.Api.Secure = true; // HTTPS use karo
    }

    public async Task<CloudinaryUploadResult> UploadAsync(IFormFile file, string folder)
    {
        _logger.LogInformation(
            "Cloudinary par upload ho raha hai: {FileName}", file.FileName);

        using var stream = file.OpenReadStream();

        // File type ke hisaab se upload params
        if (file.ContentType.StartsWith("image/"))
        {
            return await UploadImageAsync(stream, file.FileName, folder, file.Length);
        }
        else if (file.ContentType.StartsWith("video/"))
        {
            return await UploadVideoAsync(stream, file.FileName, folder, file.Length);
        }
        else
        {
            return await UploadRawAsync(stream, file.FileName, folder,
                file.Length, file.ContentType);
        }
    }

    private async Task<CloudinaryUploadResult> UploadImageAsync(
        Stream stream, string fileName, string folder, long fileSize)
    {
        var uploadParams = new ImageUploadParams
        {
            File = new FileDescription(fileName, stream),
            Folder = $"connecthub/{folder}",
            // Auto quality aur format optimize karo
            Transformation = new Transformation()
                .Quality("auto")
                .FetchFormat("auto"),
            UseFilename = true,
            UniqueFilename = true,
            Overwrite = false
        };

        var result = await _cloudinary.UploadAsync(uploadParams);

        if (result.Error is not null)
        {
            _logger.LogError("Cloudinary upload error: {Error}", result.Error.Message);
            throw new Exception($"Upload failed: {result.Error.Message}");
        }

        // Image ke liye thumbnail bhi banao
        var thumbnailUrl = GetThumbnailUrl(result.PublicId);

        return new CloudinaryUploadResult
        {
            PublicId = result.PublicId,
            PublicUrl = result.SecureUrl.ToString(),
            ThumbnailUrl = thumbnailUrl,
            FileSizeKb = fileSize / 1024,
            ContentType = "image/" + result.Format
        };
    }

    private async Task<CloudinaryUploadResult> UploadVideoAsync(
        Stream stream, string fileName, string folder, long fileSize)
    {
        var uploadParams = new VideoUploadParams
        {
            File = new FileDescription(fileName, stream),
            Folder = $"connecthub/{folder}",
            UseFilename = true,
            UniqueFilename = true,
            Overwrite = false
        };

        var result = await _cloudinary.UploadAsync(uploadParams);

        if (result.Error is not null)
        {
            _logger.LogError("Cloudinary video upload error: {Error}", result.Error.Message);
            throw new Exception($"Upload failed: {result.Error.Message}");
        }

        return new CloudinaryUploadResult
        {
            PublicId = result.PublicId,
            PublicUrl = result.SecureUrl.ToString(),
            ThumbnailUrl = null,
            FileSizeKb = fileSize / 1024,
            ContentType = "video/" + result.Format
        };
    }

    private async Task<CloudinaryUploadResult> UploadRawAsync(
        Stream stream, string fileName, string folder, long fileSize, string contentType)
    {
        var uploadParams = new RawUploadParams
        {
            File = new FileDescription(fileName, stream),
            Folder = $"connecthub/{folder}",
            UseFilename = true,
            UniqueFilename = true,
            Overwrite = false
        };

        var result = await _cloudinary.UploadAsync(uploadParams);

        if (result.Error is not null)
        {
            _logger.LogError("Cloudinary raw upload error: {Error}", result.Error.Message);
            throw new Exception($"Upload failed: {result.Error.Message}");
        }

        return new CloudinaryUploadResult
        {
            PublicId = result.PublicId,
            PublicUrl = result.SecureUrl.ToString(),
            ThumbnailUrl = null,
            FileSizeKb = fileSize / 1024,
            ContentType = contentType
        };
    }

    public async Task<bool> DeleteAsync(string publicId)
    {
        _logger.LogInformation("Cloudinary se delete ho raha hai: {PublicId}", publicId);

        var deleteParams = new DeletionParams(publicId);
        var result = await _cloudinary.DestroyAsync(deleteParams);

        return result.Result == "ok";
    }

    public string GetThumbnailUrl(string publicId, int width = 200, int height = 200)
    {
        // Cloudinary transformation URL banao
        return _cloudinary.Api.UrlImgUp
            .Transform(new Transformation()
                .Width(width)
                .Height(height)
                .Crop("fill")
                .Quality("auto"))
            .BuildUrl(publicId);
    }
}