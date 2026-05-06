using ConnectHub.Message.API.DTOs;
using ConnectHub.Message.API.Models;
using ConnectHub.Message.API.Repositories;
using ConnectHub.Shared.Models;

namespace ConnectHub.Message.API.Services;

public class MessageService : IMessageService
{
    private readonly IMessageRepository _repo;

    public MessageService(IMessageRepository repo)
    {
        _repo = repo;
    }

    public async Task<MessageResponseDto> SendMessageAsync(SendMessageDto dto)
    {
        // Validation — ya ReceiverId ya RoomId hona chahiye
        if (dto.ReceiverId is null && dto.RoomId is null)
            throw new ArgumentException("ReceiverId ya RoomId mein se ek zaroori hai.");

        var message = new MessageEntity
        {
            SenderId = dto.SenderId,
            ReceiverId = dto.ReceiverId,
            RoomId = dto.RoomId,
            Content = dto.Content,
            MessageType = dto.MessageType,
            MediaUrl = dto.MediaUrl,
            ReplyToMessageId = dto.ReplyToMessageId,
            // UTC is canonical on the wire; clients format to local/IST.
            SentAt = DateTime.UtcNow
        };

        var created = await _repo.CreateAsync(message);
        return MapToDto(created);
    }

    public async Task<PagedResult<MessageResponseDto>> GetDirectMessagesAsync(
        int userId1, int userId2, int page, int pageSize)
    {
        var messages = await _repo.FindDirectMessagesAsync(userId1, userId2, page, pageSize);
        var total = await _repo.CountDirectMessagesAsync(userId1, userId2);

        // userId1 is "me" by frontend convention. Filter out anything they
        // chose "Delete for me" on, so it stays gone after a refresh.
        return new PagedResult<MessageResponseDto>
        {
            Items = messages
                .Where(m => !IsDeletedForUser(m, userId1))
                .Select(MapToDto)
                .ToList(),
            TotalCount = total,
            PageNumber = page,
            PageSize = pageSize
        };
    }

    public async Task<PagedResult<MessageResponseDto>> GetRoomMessagesAsync(
        int roomId, int page, int pageSize)
    {
        var messages = await _repo.FindRoomMessagesAsync(roomId, page, pageSize);
        var total = await _repo.CountRoomMessagesAsync(roomId);
        // Room messages can't be filtered server-side without knowing the caller —
        // we keep delete-for-me to direct chats for now (simpler + matches WhatsApp UX).
        return new PagedResult<MessageResponseDto>
        {
            Items = messages.Select(MapToDto).ToList(),
            TotalCount = total,
            PageNumber = page,
            PageSize = pageSize
        };
    }

    public async Task<IList<MessageResponseDto>> GetUnreadMessagesAsync(int receiverId)
    {
        var messages = await _repo.FindUnreadByReceiverIdAsync(receiverId);
        return messages.Select(MapToDto).ToList();
    }

    public async Task<int> GetUnreadCountAsync(int receiverId) =>
        await _repo.CountUnreadAsync(receiverId);

    public async Task<MessageResponseDto> EditMessageAsync(int messageId, EditMessageDto dto)
    {
        var message = await _repo.FindByIdAsync(messageId)
            ?? throw new KeyNotFoundException("Message nahi mila.");

        message.Content = dto.Content;
        message.IsEdited = true;
        message.EditedAt = DateTime.UtcNow;

        var updated = await _repo.UpdateAsync(message);
        return MapToDto(updated);
    }

    public async Task<bool> DeleteMessageAsync(int messageId)
    {
        var message = await _repo.FindByIdAsync(messageId);
        if (message is null) return false;

        // "Delete for everyone" — soft delete; the row stays so reply-quotes still resolve,
        // and the client renders "This message was deleted." from the IsDeleted flag.
        message.IsDeleted = true;
        message.Content = "This message was deleted.";
        message.MediaUrl = null;
        await _repo.UpdateAsync(message);
        return true;
    }

    public async Task<bool> DeleteForMeAsync(int messageId, int userId)
    {
        var message = await _repo.FindByIdAsync(messageId);
        if (message is null) return false;

        var ids = (message.DeletedForUserIds ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .ToHashSet();

        if (!ids.Add(userId.ToString())) return true; // already deleted-for-me — idempotent

        message.DeletedForUserIds = string.Join(",", ids);
        await _repo.UpdateAsync(message);
        return true;
    }

    public async Task<MessageResponseDto?> MarkDeliveredAsync(int messageId, int recipientId)
    {
        var message = await _repo.FindByIdAsync(messageId);
        if (message is null) return null;
        // Only the actual recipient can flip the flag — protects against forged events.
        if (message.ReceiverId != recipientId) return null;
        if (message.IsDelivered) return MapToDto(message);

        message.IsDelivered = true;
        message.DeliveredAt = DateTime.UtcNow;
        var saved = await _repo.UpdateAsync(message);
        return MapToDto(saved);
    }

    public async Task<IList<DeliveredMessageDto>> MarkAllDeliveredAsync(int recipientId)
    {
        var updated = await _repo.MarkAllDeliveredForRecipientAsync(recipientId);
        // Project to a thin payload — the recipient's client only needs the
        // tuple (messageId, senderId, deliveredAt) to fire a SignalR
        // BroadcastMessageDelivered per row. Skipping the full MessageEntity
        // keeps the response small even when hundreds of messages catch up
        // after a long offline window.
        return updated
            .Where(m => m.DeliveredAt.HasValue)
            .Select(m => new DeliveredMessageDto(m.MessageId, m.SenderId, AsUtc(m.DeliveredAt!.Value)))
            .ToList();
    }

    public Task<int> MarkAllReadAsync(int senderId, int receiverId) =>
        _repo.MarkAllReadAsync(senderId, receiverId);

    public async Task<IList<MessageResponseDto>> SearchMessagesAsync(int userId, string keyword)
    {
        if (string.IsNullOrWhiteSpace(keyword)) return new List<MessageResponseDto>();
        var messages = await _repo.SearchMessagesAsync(userId, keyword.Trim());
        return messages.Select(MapToDto).ToList();
    }

    public async Task<IList<MessageResponseDto>> SearchRoomMessagesAsync(int roomId, string keyword)
    {
        if (string.IsNullOrWhiteSpace(keyword)) return new List<MessageResponseDto>();
        var messages = await _repo.SearchRoomMessagesAsync(roomId, keyword.Trim());
        return messages.Select(MapToDto).ToList();
    }

    public async Task<IList<ConversationSummaryDto>> GetRecentConversationsAsync(int userId)
    {
        var latest = await _repo.FindLatestPerPartnerAsync(userId);
        var summaries = new List<ConversationSummaryDto>(latest.Count);
        foreach (var m in latest)
        {
            var partnerId = m.SenderId == userId ? (m.ReceiverId ?? 0) : m.SenderId;
            if (partnerId == 0) continue;

            var unread = await _repo.CountUnreadFromAsync(partnerId, userId);
            summaries.Add(new ConversationSummaryDto
            {
                PartnerId = partnerId,
                LastMessageId = m.MessageId,
                LastMessage = BuildPreview(m),
                LastMessageType = m.MessageType,
                LastSenderId = m.SenderId,
                // Mark Kind=Utc so System.Text.Json emits the trailing 'Z' and
                // the client doesn't accidentally parse the timestamp as local time.
                LastSentAt = AsUtc(m.SentAt),
                UnreadCount = unread
            });
        }
        return summaries.OrderByDescending(s => s.LastSentAt).ToList();
    }

    // Sidebar preview text. Lower-case "[image]" / "[file]" matches the client's
    // own preview generator so server-rendered and SignalR-rendered rows look
    // identical. Deleted rows always show the WhatsApp-style placeholder.
    private static string BuildPreview(MessageEntity m)
    {
        if (m.IsDeleted) return "This message was deleted.";
        if (m.MessageType == Shared.Enums.MessageType.TEXT)
        {
            var text = m.Content ?? string.Empty;
            return text.Length > 80 ? text[..80] + "…" : text;
        }
        return m.MessageType switch
        {
            Shared.Enums.MessageType.IMAGE => "[image]",
            Shared.Enums.MessageType.FILE  => "[file]",
            Shared.Enums.MessageType.AUDIO => "[audio]",
            _ => "[media]"
        };
    }

    // ── Private helpers ───────────────────────────────────────────
    private static bool IsDeletedForUser(MessageEntity m, int userId)
    {
        if (string.IsNullOrEmpty(m.DeletedForUserIds)) return false;
        var key = userId.ToString();
        foreach (var id in m.DeletedForUserIds.Split(',', StringSplitOptions.RemoveEmptyEntries))
            if (id.Trim() == key) return true;
        return false;
    }

    private static MessageResponseDto MapToDto(MessageEntity m) => new()
    {
        MessageId = m.MessageId,
        SenderId = m.SenderId,
        ReceiverId = m.ReceiverId,
        RoomId = m.RoomId,
        Content = m.Content,
        MessageType = m.MessageType,
        IsRead = m.IsRead,
        IsDelivered = m.IsDelivered,
        IsEdited = m.IsEdited,
        // EF Core hands these back as Kind=Unspecified after a round trip through
        // PostgreSQL. We force Utc so the JSON serializer writes "...Z" and the
        // browser parses them as UTC instead of silently shifting by local offset.
        SentAt = AsUtc(m.SentAt),
        DeliveredAt = AsUtcNullable(m.DeliveredAt),
        ReadAt = AsUtcNullable(m.ReadAt),
        EditedAt = AsUtcNullable(m.EditedAt),
        MediaUrl = m.MediaUrl,
        ReplyToMessageId = m.ReplyToMessageId,
        IsDeleted = m.IsDeleted
    };

    private static DateTime AsUtc(DateTime value) =>
        value.Kind == DateTimeKind.Utc ? value : DateTime.SpecifyKind(value, DateTimeKind.Utc);

    private static DateTime? AsUtcNullable(DateTime? value) =>
        value.HasValue ? AsUtc(value.Value) : null;
}
