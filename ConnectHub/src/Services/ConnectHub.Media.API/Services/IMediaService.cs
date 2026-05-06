using Microsoft.AspNetCore.Http;
using ConnectHub.Media.API.DTOs;

namespace ConnectHub.Media.API.Services;

public interface IMediaService
{
    Task<UploadResponseDto> UploadFileAsync(IFormFile file, int uploadedBy,
        int? messageId, int? roomId, bool isPermanent);
    Task<MediaFileResponseDto?> GetFileByIdAsync(Guid fileId);
    Task<IList<MediaFileResponseDto>> GetFilesByUserAsync(int userId);
    Task<IList<MediaFileResponseDto>> GetFilesByRoomAsync(int roomId);
    Task<bool> DeleteFileAsync(Guid fileId);
    Task<MediaStatsDto> GetStatsAsync();
}
