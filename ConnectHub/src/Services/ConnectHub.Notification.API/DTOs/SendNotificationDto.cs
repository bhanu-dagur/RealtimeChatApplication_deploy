using System.ComponentModel.DataAnnotations;
using ConnectHub.Shared.Enums;

namespace ConnectHub.Notification.API.DTOs;

public class SendNotificationDto
{
    [Required]
    public int RecipientId { get; set; }

    public int? SenderId { get; set; }

    public NotificationType Type { get; set; } = NotificationType.MESSAGE;

    [Required, MaxLength(200)]
    public string Title { get; set; } = string.Empty;

    [Required, MaxLength(1000)]
    public string Message { get; set; } = string.Empty;

    public int? RelatedId { get; set; }
}