using ConnectHub.Shared.Enums;

namespace ConnectHub.Room.API.Services;

public interface INotificationClient
{
    Task SendAsync(
        int recipientId,
        int? senderId,
        NotificationType type,
        string title,
        string message,
        int? relatedId,
        CancellationToken ct = default);
}
