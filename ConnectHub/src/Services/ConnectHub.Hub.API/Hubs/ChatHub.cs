using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Security.Claims;
using ConnectHub.Hub.API.Models;
using ConnectHub.Hub.API.Services;
namespace ConnectHub.Hub.API.Hubs;

[Authorize]
public class ChatHub : Microsoft.AspNetCore.SignalR.Hub
{
    private readonly IPresenceService _presence;
    private readonly IUserStatusService _userStatus;
    private readonly ILogger<ChatHub> _logger;

    public ChatHub(IPresenceService presence, IUserStatusService userStatus, ILogger<ChatHub> logger)
    {
        _presence = presence;
        _userStatus = userStatus;
        _logger = logger;
    }

    // ── Connection Events ─────────────────────────────────────────

    public override async Task OnConnectedAsync()
    {
        var userId = GetUserId();
        var userName = GetUserName();

        if (userId == 0)
        {
            _logger.LogWarning("Anonymous SignalR connection rejected. ConnectionId: {ConnectionId}", Context.ConnectionId);
            Context.Abort();
            return;
        }

        // Was the user already online via another tab? Used below to decide whether
        // to broadcast UserOnline (avoid spamming presence flicker on multi-tab).
        var wasAlreadyOnline = await _presence.IsUserOnlineAsync(userId);

        await _presence.UserConnectedAsync(userId, userName, Context.ConnectionId);

        // Database flag — fire-and-forget; failures never block the chat.
        _ = _userStatus.UpdateUserOnlineStatusAsync(userId, true);

        _logger.LogInformation(
            "User {UserId} ({UserName}) connected. ConnectionId: {ConnectionId}",
            userId, userName, Context.ConnectionId);

        if (!wasAlreadyOnline)
        {
            await Clients.Others.SendAsync("UserOnline", new
            {
                UserId = userId,
                UserName = userName,
                ConnectedAt = DateTime.UtcNow
            });
        }

        // Hand the caller the current online roster, excluding self — the client
        // already knows it's online and would otherwise render "you are online" badges.
        var onlineUsers = (await _presence.GetOnlineUserIdsAsync())
            .Where(id => id != userId)
            .ToList();
        await Clients.Caller.SendAsync("OnlineUsers", onlineUsers);

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userId = GetUserId();
        var userName = GetUserName();

        if (userId == 0)
        {
            await base.OnDisconnectedAsync(exception);
            return;
        }

        await _presence.UserDisconnectedAsync(userId, Context.ConnectionId);

        _logger.LogInformation(
            "User {UserId} ({UserName}) disconnected. ConnectionId: {ConnectionId}",
            userId, userName, Context.ConnectionId);

        // Multi-tab: only flip to offline + broadcast when the LAST tab closes.
        var remainingConnections = await _presence.GetConnectionsByUserIdAsync(userId);
        if (remainingConnections.Count == 0)
        {
            _ = _userStatus.UpdateUserOnlineStatusAsync(userId, false);

            await Clients.Others.SendAsync("UserOffline", new
            {
                UserId = userId,
                UserName = userName,
                LastSeen = DateTime.UtcNow
            });
        }

        await base.OnDisconnectedAsync(exception);
    }

    // ── Direct Message ────────────────────────────────────────────

    public async Task SendDirectMessage(ChatMessage message)
    {
        var senderId = GetUserId();
        message.SenderId = senderId;
        message.SenderName = GetUserName();
        // Trust SentAt from the saved DB record — only stamp now if the client didn't.
        if (message.SentAt == default) message.SentAt = DateTime.UtcNow;

        _logger.LogInformation(
            "Direct message from {SenderId} to {ReceiverId} (MessageId: {MessageId})",
            senderId, message.ReceiverId, message.MessageId);

        // Send to every connection of both sender and receiver so multi-tab works.
        // Clients.User(...) targets all of that user's connections; Clients.Users(...) unions both.
        var targets = new List<string> { senderId.ToString() };
        if (message.ReceiverId.HasValue && message.ReceiverId.Value != senderId)
            targets.Add(message.ReceiverId.Value.ToString());

        try
        {
            await Clients.Users(targets).SendAsync("ReceiveDirectMessage", message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "SendDirectMessage failed for sender {SenderId} → receiver {ReceiverId} (MessageId: {MessageId})",
                senderId, message.ReceiverId, message.MessageId);
        }
    }

    // ── Edit/Delete Broadcasts ────────────────────────────────────
    // Called by clients after a successful PUT /edit or DELETE — pushes the updated row
    // (or just the id+isDeleted=true) to everyone affected so each open tab can patch its UI.

    public async Task BroadcastMessageEdited(ChatMessage message)
    {
        if (message.RoomId.HasValue)
        {
            await Clients.Group(message.RoomId.Value.ToString())
                .SendAsync("MessageEdited", message);
            return;
        }

        var senderId = GetUserId();
        var targets = new List<string> { senderId.ToString() };
        if (message.ReceiverId.HasValue && message.ReceiverId.Value != senderId)
            targets.Add(message.ReceiverId.Value.ToString());
        await Clients.Users(targets).SendAsync("MessageEdited", message);
    }

    public async Task BroadcastMessageDeleted(int messageId, int? receiverId, int? roomId)
    {
        var payload = new { MessageId = messageId, RoomId = roomId, ReceiverId = receiverId };

        if (roomId.HasValue)
        {
            await Clients.Group(roomId.Value.ToString())
                .SendAsync("MessageDeleted", payload);
            return;
        }

        var senderId = GetUserId();
        var targets = new List<string> { senderId.ToString() };
        if (receiverId.HasValue && receiverId.Value != senderId)
            targets.Add(receiverId.Value.ToString());
        await Clients.Users(targets).SendAsync("MessageDeleted", payload);
    }

    // Recipient-side ack: invoked from the receiver's tab right after it inserts an
    // incoming direct message into its UI. Pushes "MessageDelivered" back to the
    // original sender so their bubble flips ✓ → ✓✓ in real time. The actual DB
    // flag flip already happened via the REST PUT /api/messages/{id}/delivered;
    // this method only fans the event out across SignalR.
    public async Task BroadcastMessageDelivered(int messageId, int senderId, DateTime deliveredAt)
    {
        var ackerId = GetUserId();
        if (ackerId == 0) return;

        var payload = new
        {
            MessageId = messageId,
            DeliveredBy = ackerId,
            DeliveredAt = deliveredAt == default ? DateTime.UtcNow : deliveredAt
        };

        await Clients.User(senderId.ToString()).SendAsync("MessageDelivered", payload);
    }

    // Recipient opened the chat → backend bulk-marked everything from `senderId`
    // as read. Fan a "MessagesRead" event back to the sender's tabs so every bubble
    // they sent flips to ✓✓ blue at once. Receiver invokes this AFTER the
    // /mark-read REST call completes.
    public async Task BroadcastMessagesRead(int senderId)
    {
        var readerId = GetUserId();
        if (readerId == 0) return;

        var payload = new
        {
            ReaderId = readerId,
            PartnerId = senderId,
            ReadAt = DateTime.UtcNow
        };

        // Tell the original sender's tabs (and the reader's other tabs too,
        // so their unread badge clears across devices).
        await Clients.Users(new[] { senderId.ToString(), readerId.ToString() })
            .SendAsync("MessagesRead", payload);
    }

    // ── Room Message ──────────────────────────────────────────────

    public async Task SendRoomMessage(ChatMessage message)
    {
        var senderId = GetUserId();
        message.SenderId = senderId;
        message.SenderName = GetUserName();
        if (message.SentAt == default) message.SentAt = DateTime.UtcNow;

        if (!message.RoomId.HasValue)
        {
            await Clients.Caller.SendAsync("Error", "RoomId zaroori hai.");
            return;
        }

        _logger.LogInformation(
            "Room message from {SenderId} to Room {RoomId}",
            senderId, message.RoomId);

        // Room ke saare members ko message bhejo
        try
        {
            await Clients.Group(message.RoomId.Value.ToString())
                .SendAsync("ReceiveRoomMessage", message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "SendRoomMessage failed for room {RoomId} from sender {SenderId} (MessageId: {MessageId})",
                message.RoomId.Value, senderId, message.MessageId);
        }
    }

    // ── Room Join / Leave ─────────────────────────────────────────

    public async Task JoinRoom(int roomId)
    {
        var userId = GetUserId();
        var userName = GetUserName();

        // SignalR group mein add karo
        await Groups.AddToGroupAsync(Context.ConnectionId, roomId.ToString());

        _logger.LogInformation(
            "User {UserId} joined Room {RoomId}", userId, roomId);

        // Room ke baaki members ko batao
        await Clients.OthersInGroup(roomId.ToString())
            .SendAsync("UserJoinedRoom", new
            {
                RoomId = roomId,
                UserId = userId,
                UserName = userName,
                JoinedAt = DateTime.UtcNow
            });

        // Caller ko confirm karo
        await Clients.Caller.SendAsync("JoinedRoom", roomId);
    }

    public async Task LeaveRoom(int roomId)
    {
        var userId = GetUserId();
        var userName = GetUserName();

        // SignalR group se remove karo
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, roomId.ToString());

        _logger.LogInformation(
            "User {UserId} left Room {RoomId}", userId, roomId);

        // Room ke baaki members ko batao
        await Clients.OthersInGroup(roomId.ToString())
            .SendAsync("UserLeftRoom", new
            {
                RoomId = roomId,
                UserId = userId,
                UserName = userName,
                LeftAt = DateTime.UtcNow
            });

        await Clients.Caller.SendAsync("LeftRoom", roomId);
    }

    // ── Typing Indicator ──────────────────────────────────────────

    public async Task TypingIndicator(int? receiverId, int? roomId, bool isTyping)
    {
        var senderId = GetUserId();
        var senderName = GetUserName();

        var payload = new
        {
            SenderId = senderId,
            SenderName = senderName,
            IsTyping = isTyping,
            Timestamp = DateTime.UtcNow
        };

        if (receiverId.HasValue)
        {
            // Direct message typing
            await Clients.User(receiverId.Value.ToString())
                .SendAsync("UserTyping", payload);
        }
        else if (roomId.HasValue)
        {
            // Room typing — sender ko chhodkar baaki sab ko
            await Clients.OthersInGroup(roomId.Value.ToString())
                .SendAsync("UserTyping", payload);
        }
    }

    // ── Read Receipt ──────────────────────────────────────────────

    public async Task MarkMessageRead(int messageId, int senderId)
    {
        var readerId = GetUserId();

        // Message sender ko batao ki message padh liya gaya
        await Clients.User(senderId.ToString())
            .SendAsync("MessageRead", new
            {
                MessageId = messageId,
                ReadBy = readerId,
                ReadAt = DateTime.UtcNow
            });
    }

    // ── Media Message ─────────────────────────────────────────────

    public async Task SendMediaMessage(ChatMessage message)
    {
        var senderId = GetUserId();
        message.SenderId = senderId;
        message.SenderName = GetUserName();
        message.SentAt = DateTime.UtcNow;

        if (message.RoomId.HasValue)
        {
            await Clients.Group(message.RoomId.Value.ToString())
                .SendAsync("ReceiveRoomMessage", message);
        }
        else if (message.ReceiverId.HasValue)
        {
            await Clients.User(message.ReceiverId.Value.ToString())
                .SendAsync("ReceiveDirectMessage", message);

            await Clients.User(senderId.ToString())
                .SendAsync("ReceiveDirectMessage", message);
        }
    }

    // ── Notification Push ─────────────────────────────────────────

    public async Task SendNotification(int recipientId, string title, string messageText)
    {
        await Clients.User(recipientId.ToString())
            .SendAsync("ReceiveNotification", new
            {
                Title = title,
                Message = messageText,
                SentAt = DateTime.UtcNow
            });
    }

    // ── Private Helpers ───────────────────────────────────────────

    private int GetUserId()
    {
        var claim = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value
                 ?? Context.User?.FindFirst("sub")?.Value;

        return int.TryParse(claim, out var id) ? id : 0;
    }

    private string GetUserName()
    {
        return Context.User?.FindFirst("username")?.Value
            ?? Context.User?.Identity?.Name
            ?? "Unknown";
    }
}