using ConnectHub.Shared.Enums;

namespace ConnectHub.Hub.API.Models;

// SignalR ke through jaane wala message model
public class ChatMessage
{
    public int MessageId { get; set; }
    public int SenderId { get; set; }
    public string SenderName { get; set; } = string.Empty;
    public int? ReceiverId { get; set; }
    public int? RoomId { get; set; }
    public string Content { get; set; } = string.Empty;
    public MessageType MessageType { get; set; } = MessageType.TEXT;
    public string? MediaUrl { get; set; }
    public int? ReplyToMessageId { get; set; }
    public bool IsEdited { get; set; }
    public bool IsDeleted { get; set; }
    public DateTime SentAt { get; set; } = DateTime.UtcNow;
    public DateTime? EditedAt { get; set; }
}