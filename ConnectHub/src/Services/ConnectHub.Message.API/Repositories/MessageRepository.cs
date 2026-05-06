using Microsoft.EntityFrameworkCore;
using ConnectHub.Message.API.Data;
using ConnectHub.Message.API.Models;

namespace ConnectHub.Message.API.Repositories;

public class MessageRepository : IMessageRepository
{
    private readonly MessageDbContext _context;

    public MessageRepository(MessageDbContext context)
    {
        _context = context;
    }

    public async Task<MessageEntity?> FindByIdAsync(int messageId) =>
        await _context.Messages.FirstOrDefaultAsync(m => m.MessageId == messageId);

    public async Task<IList<MessageEntity>> FindDirectMessagesAsync(
        int userId1, int userId2, int page, int pageSize) =>
        await _context.Messages
            .Where(m =>
                (m.SenderId == userId1 && m.ReceiverId == userId2) ||
                (m.SenderId == userId2 && m.ReceiverId == userId1))
            .OrderByDescending(m => m.SentAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .OrderBy(m => m.SentAt)
            .ToListAsync();

    public async Task<int> CountDirectMessagesAsync(int userId1, int userId2) =>
        await _context.Messages
            .CountAsync(m =>
                (m.SenderId == userId1 && m.ReceiverId == userId2) ||
                (m.SenderId == userId2 && m.ReceiverId == userId1));

    public async Task<IList<MessageEntity>> FindRoomMessagesAsync(
        int roomId, int page, int pageSize) =>
        await _context.Messages
            .Where(m => m.RoomId == roomId)
            .OrderByDescending(m => m.SentAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .OrderBy(m => m.SentAt)
            .ToListAsync();

    public async Task<int> CountRoomMessagesAsync(int roomId) =>
        await _context.Messages.CountAsync(m => m.RoomId == roomId);

    public async Task<IList<MessageEntity>> FindUnreadByReceiverIdAsync(int receiverId) =>
        await _context.Messages
            .Where(m => m.ReceiverId == receiverId && !m.IsRead)
            .OrderBy(m => m.SentAt)
            .ToListAsync();

    public async Task<int> CountUnreadAsync(int receiverId) =>
        await _context.Messages
            .CountAsync(m => m.ReceiverId == receiverId && !m.IsRead);

    public async Task<IList<MessageEntity>> SearchMessagesAsync(int userId, string keyword) =>
        await _context.Messages
            .Where(m =>
                (m.SenderId == userId || m.ReceiverId == userId) &&
                m.Content.Contains(keyword))
            .OrderByDescending(m => m.SentAt)
            .Take(100)
            .ToListAsync();

    public async Task<IList<MessageEntity>> SearchRoomMessagesAsync(int roomId, string keyword) =>
        await _context.Messages
            .Where(m => m.RoomId == roomId && m.Content.Contains(keyword))
            .OrderByDescending(m => m.SentAt)
            .Take(100)
            .ToListAsync();

    public async Task<int> CountUnreadFromAsync(int senderId, int receiverId) =>
        await _context.Messages.CountAsync(m =>
            m.SenderId == senderId && m.ReceiverId == receiverId && !m.IsRead);

    public async Task<IList<MessageEntity>> FindLatestPerPartnerAsync(int userId)
    {
        var query =
            from m in _context.Messages
            where m.RoomId == null && (m.SenderId == userId || m.ReceiverId == userId)
            let partner = m.SenderId == userId ? m.ReceiverId : m.SenderId
            group m by partner into g
            select g.OrderByDescending(x => x.SentAt).First();

        return await query.ToListAsync();
    }

    public async Task<MessageEntity> CreateAsync(MessageEntity message)
    {
        _context.Messages.Add(message);
        await _context.SaveChangesAsync();
        return message;
    }

    public async Task<MessageEntity> UpdateAsync(MessageEntity message)
    {
        _context.Messages.Update(message);
        await _context.SaveChangesAsync();
        return message;
    }

    public async Task<int> MarkAllReadAsync(int senderId, int receiverId)
    {
        var unread = await _context.Messages
            .Where(m => m.SenderId == senderId &&
                        m.ReceiverId == receiverId &&
                        !m.IsRead)
            .ToListAsync();

        if (unread.Count == 0) return 0;

        var now = DateTime.UtcNow;
        foreach (var msg in unread)
        {
            msg.IsRead = true;
            msg.ReadAt = now;
            // NOTE: We deliberately do NOT auto-flip IsDelivered here. Delivered must
            // only become true via an explicit recipient-device ack (see
            // /api/messages/{id}/delivered). The frontend tick logic treats
            // isRead=true as the dominant state, so a "read but not delivered"
            // row still renders correctly as ✓✓ blue without polluting the
            // delivery audit trail.
        }

        await _context.SaveChangesAsync();
        return unread.Count;
    }

    public async Task<IList<MessageEntity>> MarkAllDeliveredForRecipientAsync(int recipientId)
    {
        var pending = await _context.Messages
            .Where(m => m.ReceiverId == recipientId && !m.IsDelivered && !m.IsDeleted)
            .ToListAsync();

        if (pending.Count == 0) return pending;

        var now = DateTime.UtcNow;
        foreach (var msg in pending)
        {
            msg.IsDelivered = true;
            msg.DeliveredAt = now;
        }
        await _context.SaveChangesAsync();
        return pending;
    }
}
