using ConnectHub.Message.API.Models;
namespace ConnectHub.Message.API.Repositories;

public interface IMessageRepository
{
    Task<MessageEntity?> FindByIdAsync(int messageId);
    Task<IList<MessageEntity>> FindDirectMessagesAsync(int userId1, int userId2, int page, int pageSize);
    Task<int> CountDirectMessagesAsync(int userId1, int userId2);
    Task<IList<MessageEntity>> FindRoomMessagesAsync(int roomId, int page, int pageSize);
    Task<int> CountRoomMessagesAsync(int roomId);
    Task<IList<MessageEntity>> FindUnreadByReceiverIdAsync(int receiverId);
    Task<int> CountUnreadAsync(int receiverId);
    Task<IList<MessageEntity>> SearchMessagesAsync(int userId, string keyword);
    Task<IList<MessageEntity>> SearchRoomMessagesAsync(int roomId, string keyword);
    Task<int> CountUnreadFromAsync(int senderId, int receiverId);
    // For each DM partner of `userId`, returns the most recent message exchanged with them.
    Task<IList<MessageEntity>> FindLatestPerPartnerAsync(int userId);
    Task<MessageEntity> CreateAsync(MessageEntity message);
    Task<MessageEntity> UpdateAsync(MessageEntity message);
    // Flips IsRead=true on every unread DM from senderId → receiverId. Returns the
    // count of rows actually flipped so callers can short-circuit no-op responses.
    Task<int> MarkAllReadAsync(int senderId, int receiverId);
    // Returns the list of newly-delivered messages so the caller can SignalR-broadcast
    // each one's MessageDelivered event back to the original sender's tabs.
    Task<IList<MessageEntity>> MarkAllDeliveredForRecipientAsync(int recipientId);
    
    // Admin operations
    Task<IList<MessageEntity>> FindAllMessagesAdminAsync(int page, int pageSize);
    Task<int> CountAllMessagesAsync();
    Task<bool> HardDeleteAsync(int messageId);
}
