using ConnectHub.Shared.Enums;

namespace ConnectHub.Message.API.DTOs;

public class MessageResponseDto
{
    public int MessageId { get; set; }
    public int SenderId { get; set; }
    public int? ReceiverId { get; set; }
    public int? RoomId { get; set; }
    public string Content { get; set; } = string.Empty;
    public MessageType MessageType { get; set; }
    public bool IsRead { get; set; }
    public bool IsDelivered { get; set; }
    public bool IsEdited { get; set; }
    public DateTime SentAt { get; set; }
    public DateTime? DeliveredAt { get; set; }
    public DateTime? ReadAt { get; set; }
    public DateTime? EditedAt { get; set; }
    public string? MediaUrl { get; set; }
    public int? ReplyToMessageId { get; set; }
    public bool IsDeleted { get; set; }
}