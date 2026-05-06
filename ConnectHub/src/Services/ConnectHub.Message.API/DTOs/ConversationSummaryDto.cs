using ConnectHub.Shared.Enums;

namespace ConnectHub.Message.API.DTOs;

// One row per "conversation partner" for the sidebar:
//   - PartnerId   = the *other* user in the DM
//   - LastMessage = preview of the most recent message (truncated server-side)
//   - LastSentAt  = UTC timestamp of that message (used for ordering on the client)
//   - UnreadCount = number of unread messages addressed to the requesting user
public class ConversationSummaryDto
{
    public int PartnerId { get; set; }
    public int? LastMessageId { get; set; }
    public string? LastMessage { get; set; }
    public MessageType LastMessageType { get; set; }
    public int? LastSenderId { get; set; }
    public DateTime? LastSentAt { get; set; }
    public int UnreadCount { get; set; }
}
