using ConnectHub.Shared.Enums;

namespace ConnectHub.Notification.API.DTOs;

public class NotificationResponseDto
{
    public int NotificationId { get; set; }
    public int RecipientId { get; set; }
    public int? SenderId { get; set; }
    public NotificationType Type { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public int? RelatedId { get; set; }
    public bool IsRead { get; set; }
    public DateTime SentAt { get; set; }
    public DateTime? ReadAt { get; set; }
}