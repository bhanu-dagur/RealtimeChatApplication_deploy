using Microsoft.EntityFrameworkCore;
using ConnectHub.Media.API.Data;
using ConnectHub.Media.API.DTOs;
using ConnectHub.Media.API.Models;

namespace ConnectHub.Media.API.Repositories;

public class MediaRepository : IMediaRepository
{
    private readonly MediaDbContext _context;

    public MediaRepository(MediaDbContext context)
    {
        _context = context;
    }

    public async Task<MediaFile?> FindByIdAsync(Guid fileId) =>
        await _context.MediaFiles
            .FirstOrDefaultAsync(m => m.FileId == fileId);

    public async Task<IList<MediaFile>> FindByUploadedByAsync(int userId) =>
        await _context.MediaFiles
            .Where(m => m.UploadedBy == userId)
            .OrderByDescending(m => m.UploadedAt)
            .ToListAsync();

    public async Task<IList<MediaFile>> FindByRoomIdAsync(int roomId) =>
        await _context.MediaFiles
            .Where(m => m.RoomId == roomId)
            .OrderByDescending(m => m.UploadedAt)
            .ToListAsync();

    public async Task<IList<MediaFile>> FindByMessageIdAsync(int messageId) =>
        await _context.MediaFiles
            .Where(m => m.MessageId == messageId)
            .ToListAsync();

    public async Task<IList<MediaFile>> FindExpiredFilesAsync(DateTime beforeDate) =>
        await _context.MediaFiles
            .IgnoreQueryFilters() // Soft delete filter bypass karo
            .Where(m => m.ExpiresAt.HasValue &&
                        m.ExpiresAt < beforeDate &&
                        !m.IsDeleted)
            .ToListAsync();

    public async Task<MediaFile> CreateAsync(MediaFile file)
    {
        _context.MediaFiles.Add(file);
        await _context.SaveChangesAsync();
        return file;
    }

    public async Task<MediaFile> UpdateAsync(MediaFile file)
    {
        _context.MediaFiles.Update(file);
        await _context.SaveChangesAsync();
        return file;
    }

    public async Task<bool> SoftDeleteAsync(Guid fileId)
    {
        var file = await _context.MediaFiles
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(m => m.FileId == fileId);

        if (file is null) return false;

        file.IsDeleted = true;
        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<MediaStatsDto> GetStatsAsync()
    {
        var files = await _context.MediaFiles.ToListAsync();
        var now = DateTime.UtcNow;

        return new MediaStatsDto
        {
            TotalFiles = files.Count,
            TotalSizeKb = files.Sum(f => f.FileSizeKb),
            ImageCount = files.Count(f => f.ContentType.StartsWith("image/")),
            DocumentCount = files.Count(f =>
                f.ContentType.Contains("pdf") ||
                f.ContentType.Contains("word") ||
                f.ContentType.Contains("document")),
            AudioCount = files.Count(f => f.ContentType.StartsWith("audio/")),
            ExpiredCount = files.Count(f =>
                f.ExpiresAt.HasValue && f.ExpiresAt < now)
        };
    }
}