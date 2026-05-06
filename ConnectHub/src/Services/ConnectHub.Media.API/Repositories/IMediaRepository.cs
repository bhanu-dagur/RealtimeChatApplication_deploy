using ConnectHub.Media.API.Models;
using ConnectHub.Media.API.DTOs;

namespace ConnectHub.Media.API.Repositories;

public interface IMediaRepository
{
    Task<MediaFile?> FindByIdAsync(Guid fileId);
    Task<IList<MediaFile>> FindByUploadedByAsync(int userId);
    Task<IList<MediaFile>> FindByRoomIdAsync(int roomId);
    Task<IList<MediaFile>> FindByMessageIdAsync(int messageId);
    Task<IList<MediaFile>> FindExpiredFilesAsync(DateTime beforeDate);
    Task<MediaFile> CreateAsync(MediaFile file);
    Task<MediaFile> UpdateAsync(MediaFile file);
    Task<bool> SoftDeleteAsync(Guid fileId);
    Task<MediaStatsDto> GetStatsAsync();
}