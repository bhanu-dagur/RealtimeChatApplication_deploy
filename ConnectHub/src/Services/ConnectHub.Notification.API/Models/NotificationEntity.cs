using System.ComponentModel.DataAnnotations;
using ConnectHub.Shared.Enums;

namespace ConnectHub.Notification.API.Models;

public class NotificationEntity
{
    public int NotificationId { get; set; }

    // Jise notification jaani hai
    [Required]
    public int RecipientId { get; set; }

    // Kisne bheja (system notification ho toh null)
    public int? SenderId { get; set; }

    public NotificationType Type { get; set; } = NotificationType.MESSAGE;

    [Required, MaxLength(200)]
    public string Title { get; set; } = string.Empty;

    [Required, MaxLength(1000)]
    public string Message { get; set; } = string.Empty;

    // Related entity ka Id — message, room, etc.
    public int? RelatedId { get; set; }

    public bool IsRead { get; set; } = false;

    public DateTime SentAt { get; set; } = DateTime.UtcNow;

    public DateTime? ReadAt { get; set; }
}