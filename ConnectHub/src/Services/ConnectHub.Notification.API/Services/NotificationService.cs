using Microsoft.AspNetCore.SignalR;
using ConnectHub.Notification.API.DTOs;
using ConnectHub.Notification.API.Hubs;
using ConnectHub.Notification.API.Models;
using ConnectHub.Notification.API.Repositories;
using ConnectHub.Shared.Enums;
using ConnectHub.Shared.Models;

namespace ConnectHub.Notification.API.Services;

public class NotificationService : INotificationService
{
    private readonly INotificationRepository _repo;
    private readonly IHubContext<NotificationHub> _hubContext;
    private readonly IEmailService _emailService;
    private readonly ILogger<NotificationService> _logger;

    public NotificationService(
        INotificationRepository repo,
        IHubContext<NotificationHub> hubContext,
        IEmailService emailService,
        ILogger<NotificationService> logger)
    {
        _repo = repo;
        _hubContext = hubContext;
        _emailService = emailService;
        _logger = logger;
    }

    public async Task<NotificationResponseDto> SendAsync(SendNotificationDto dto)
    {
        // DB mein save karo
        var notification = new NotificationEntity
        {
            RecipientId = dto.RecipientId,
            SenderId = dto.SenderId,
            Type = dto.Type,
            Title = dto.Title,
            Message = dto.Message,
            RelatedId = dto.RelatedId
        };

        var created = await _repo.CreateAsync(notification);

        // Real-time push — SignalR se badge count update karo
        var unreadCount = await _repo.CountUnreadByRecipientIdAsync(dto.RecipientId);

        await _hubContext.Clients
            .User(dto.RecipientId.ToString())
            .SendAsync("ReceiveNotification", new
            {
                Notification = MapToDto(created),
                UnreadCount = unreadCount
            });

        _logger.LogInformation(
            "Notification sent to User {RecipientId}: {Title}",
            dto.RecipientId, dto.Title);

        return MapToDto(created);
    }

    public async Task<IList<NotificationResponseDto>> SendBulkAsync(
        BroadcastNotificationDto dto)
    {
        var notifications = new List<NotificationEntity>();

        // Specific users ko ya sabko
        var recipientIds = dto.RecipientIds.Any()
            ? dto.RecipientIds
            : new List<int>(); // Yahan sab users ki list chahiye hogi

        foreach (var recipientId in recipientIds)
        {
            notifications.Add(new NotificationEntity
            {
                RecipientId = recipientId,
                Type = NotificationType.PLATFORM,
                Title = dto.Title,
                Message = dto.Message
            });
        }

        var created = await _repo.CreateManyAsync(notifications);

        // Real-time push — sabko ek saath
        foreach (var recipientId in recipientIds)
        {
            await _hubContext.Clients
                .User(recipientId.ToString())
                .SendAsync("ReceiveBroadcast", new
                {
                    Title = dto.Title,
                    Message = dto.Message,
                    SentAt = DateTime.UtcNow
                });
        }

        _logger.LogInformation(
            "Broadcast sent to {Count} users: {Title}",
            recipientIds.Count, dto.Title);

        return created.Select(MapToDto).ToList();
    }

    public async Task<IList<NotificationResponseDto>> GetByRecipientAsync(int recipientId)
    {
        var notifications = await _repo.FindByRecipientIdAsync(recipientId);
        return notifications.Select(MapToDto).ToList();
    }

    public async Task<IList<NotificationResponseDto>> GetUnreadAsync(int recipientId)
    {
        var notifications = await _repo.FindUnreadByRecipientIdAsync(recipientId);
        return notifications.Select(MapToDto).ToList();
    }

    public async Task<int> GetUnreadCountAsync(int recipientId) =>
        await _repo.CountUnreadByRecipientIdAsync(recipientId);

    public async Task<NotificationResponseDto> MarkAsReadAsync(int notificationId)
    {
        var notification = await _repo.FindByIdAsync(notificationId)
            ?? throw new KeyNotFoundException("Notification nahi mili.");

        notification.IsRead = true;
        notification.ReadAt = DateTime.UtcNow;

        var updated = await _repo.UpdateAsync(notification);

        // Badge count update karo real-time
        var unreadCount = await _repo.CountUnreadByRecipientIdAsync(
            notification.RecipientId);

        await _hubContext.Clients
            .User(notification.RecipientId.ToString())
            .SendAsync("NotificationCount", unreadCount);

        return MapToDto(updated);
    }

    public async Task MarkAllReadAsync(int recipientId)
    {
        await _repo.MarkAllReadByRecipientIdAsync(recipientId);

        // Badge reset karo
        await _hubContext.Clients
            .User(recipientId.ToString())
            .SendAsync("NotificationCount", 0);
    }

    public async Task<bool> DeleteAsync(int notificationId) =>
        await _repo.DeleteAsync(notificationId);

    public async Task<PagedResult<NotificationResponseDto>> GetAllAsync(
        int page, int pageSize)
    {
        var all = await _repo.FindAllAsync();
        var paged = all
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(MapToDto)
            .ToList();

        return new PagedResult<NotificationResponseDto>
        {
            Items = paged,
            TotalCount = all.Count,
            PageNumber = page,
            PageSize = pageSize
        };
    }

    // ── Private helper ────────────────────────────────────────────
    private static NotificationResponseDto MapToDto(NotificationEntity n) => new()
    {
        NotificationId = n.NotificationId,
        RecipientId = n.RecipientId,
        SenderId = n.SenderId,
        Type = n.Type,
        Title = n.Title,
        Message = n.Message,
        RelatedId = n.RelatedId,
        IsRead = n.IsRead,
        SentAt = n.SentAt,
        ReadAt = n.ReadAt
    };
}