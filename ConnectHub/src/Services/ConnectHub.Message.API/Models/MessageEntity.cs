using System.ComponentModel.DataAnnotations;
using ConnectHub.Shared.Enums;

namespace ConnectHub.Message.API.Models;

public class MessageEntity
{
    public int MessageId { get; set; }
    
    [Required]
    public int SenderId { get; set; }

    // Direct message ke liye — Room message ho toh null
    public int? ReceiverId { get; set; }

    // Room message ke liye — Direct message ho toh null
    public int? RoomId { get; set; }

    [Required, MaxLength(2000)]
    public string Content { get; set; } = string.Empty;

    public MessageType MessageType { get; set; } = MessageType.TEXT;

    public bool IsRead { get; set; } = false;

    public bool IsDeleted { get; set; } = false;

    public bool IsEdited { get; set; } = false;

    // Delivered ≠ read. Set the moment any of the recipient's connected tabs
    // ack receipt of the SignalR push (or when the recipient comes online and
    // pulls history). Drives the second grey ✓✓ tick on the sender side.
    public bool IsDelivered { get; set; } = false;

    public DateTime SentAt { get; set; } = DateTime.UtcNow;

    public DateTime? DeliveredAt { get; set; }

    public DateTime? ReadAt { get; set; }

    public DateTime? EditedAt { get; set; }

    public string? MediaUrl { get; set; }

    // Reply feature ke liye
    public int? ReplyToMessageId { get; set; }

    // Comma-separated list of user ids who chose "Delete for me". Cheap and good
    // enough for chat scale; if it ever grows we can normalise into a join table.
    [MaxLength(500)]
    public string? DeletedForUserIds { get; set; }
}