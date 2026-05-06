using System.ComponentModel.DataAnnotations;

namespace ConnectHub.Notification.API.DTOs;

// Admin ke liye — sabko ek saath notification
public class BroadcastNotificationDto
{
    [Required, MaxLength(200)]
    public string Title { get; set; } = string.Empty;

    [Required, MaxLength(1000)]
    public string Message { get; set; } = string.Empty;

    // Specific users ko bhejo — empty ho toh sabko
    public List<int> RecipientIds { get; set; } = new();
}