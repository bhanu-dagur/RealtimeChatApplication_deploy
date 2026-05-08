using ConnectHub.Message.API.DTOs;
using ConnectHub.Shared.Models;

namespace ConnectHub.Message.API.Services;

// Bulk-delivery payload — one row per message that just flipped to
// IsDelivered=true. Returned by MarkAllDeliveredAsync so the recipient's
// client can SignalR-broadcast each tick flip back to the sender's tabs.
public record DeliveredMessageDto(int MessageId, int SenderId, DateTime DeliveredAt);

public interface IMessageService
{
    Task<MessageResponseDto> SendMessageAsync(SendMessageDto dto);
    Task<PagedResult<MessageResponseDto>> GetDirectMessagesAsync(int userId1, int userId2, int page, int pageSize);
    Task<PagedResult<MessageResponseDto>> GetRoomMessagesAsync(int roomId, int page, int pageSize);
    Task<IList<MessageResponseDto>> GetUnreadMessagesAsync(int receiverId);
    Task<int> GetUnreadCountAsync(int receiverId);
    Task<MessageResponseDto> EditMessageAsync(int messageId, EditMessageDto dto);
    Task<bool> DeleteMessageAsync(int messageId);
    Task<bool> DeleteForMeAsync(int messageId, int userId);
    Task<MessageResponseDto?> MarkDeliveredAsync(int messageId, int recipientId);
    // Returns the list of newly-delivered messages (id + senderId + deliveredAt)
    // so the recipient's client can fan out one SignalR MessageDelivered event
    // per affected sender. Without this, senders' ticks stay ✓ forever — the
    // server flipped IsDelivered=true but no one told the senders.
    Task<IList<DeliveredMessageDto>> MarkAllDeliveredAsync(int recipientId);
    Task<int> MarkAllReadAsync(int senderId, int receiverId);
    Task<IList<MessageResponseDto>> SearchMessagesAsync(int userId, string keyword);
    Task<IList<MessageResponseDto>> SearchRoomMessagesAsync(int roomId, string keyword);
    Task<IList<ConversationSummaryDto>> GetRecentConversationsAsync(int userId);

    // Admin operations
    Task<PagedResult<MessageResponseDto>> GetAllMessagesAdminAsync(int page, int pageSize);
    Task<bool> DeleteMessageAdminAsync(int messageId);
    Task<int> CountMessagesAsync();
}
