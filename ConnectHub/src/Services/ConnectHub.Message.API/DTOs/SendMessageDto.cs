using System.ComponentModel.DataAnnotations;
using ConnectHub.Shared.Enums;

namespace ConnectHub.Message.API.DTOs;

public class SendMessageDto
{
    [Required]
    public int SenderId { get; set; }

    // Ek hi hoga — ya ReceiverId ya RoomId
    public int? ReceiverId { get; set; }
    public int? RoomId { get; set; }

    [Required, MaxLength(2000)]
    public string Content { get; set; } = string.Empty;

    public MessageType MessageType { get; set; } = MessageType.TEXT;

    public string? MediaUrl { get; set; }

    public int? ReplyToMessageId { get; set; }
}