using System.ComponentModel.DataAnnotations;

namespace ConnectHub.Notification.API.DTOs;

public class EmailNotificationDto
{
    [Required, EmailAddress]
    public string ToEmail { get; set; } = string.Empty;

    [Required]
    public string ToName { get; set; } = string.Empty;

    [Required]
    public string Subject { get; set; } = string.Empty;

    [Required]
    public string Body { get; set; } = string.Empty;
}