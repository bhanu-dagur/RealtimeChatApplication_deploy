using ConnectHub.Media.API.Repositories;
using ConnectHub.Media.API.Services;

namespace ConnectHub.Media.API.BackgroundServices;

// Har roz chalega — expired files Cloudinary + DB dono se delete karega
public class MediaCleanupService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<MediaCleanupService> _logger;

    // Har 24 ghante mein chale
    private readonly TimeSpan _interval = TimeSpan.FromHours(24);

    public MediaCleanupService(
        IServiceProvider serviceProvider,
        ILogger<MediaCleanupService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Media Cleanup Service shuru ho gaya.");

        while (!stoppingToken.IsCancellationRequested)
        {
            await CleanupExpiredFilesAsync();

            // 24 ghante wait karo
            await Task.Delay(_interval, stoppingToken);
        }
    }

    private async Task CleanupExpiredFilesAsync()
    {
        _logger.LogInformation(
            "Expired files cleanup shuru: {Time}", DateTime.UtcNow);

        try
        {
            // Scoped services ke liye scope banao
            using var scope = _serviceProvider.CreateScope();
            var repo = scope.ServiceProvider.GetRequiredService<IMediaRepository>();
            var cloudinary = scope.ServiceProvider
                .GetRequiredService<ICloudinaryService>();

            // Aaj se pehle expire hone wali files
            var expiredFiles = await repo.FindExpiredFilesAsync(DateTime.UtcNow);

            _logger.LogInformation(
                "{Count} expired files mili", expiredFiles.Count);

            int deleted = 0;
            foreach (var file in expiredFiles)
            {
                try
                {
                    // Cloudinary se delete karo
                    await cloudinary.DeleteAsync(file.CloudinaryPublicId);

                    // DB mein soft delete karo
                    await repo.SoftDeleteAsync(file.FileId);

                    deleted++;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex,
                        "File delete karne mein error: {FileId}", file.FileId);
                }
            }

            _logger.LogInformation(
                "Cleanup complete: {Deleted}/{Total} files delete hue",
                deleted, expiredFiles.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Cleanup service mein error aaya.");
        }
    }
}