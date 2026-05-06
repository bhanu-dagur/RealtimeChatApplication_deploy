using ConnectHub.Notification.API.DTOs;
using ConnectHub.Shared.Models;

namespace ConnectHub.Notification.API.Services;

public interface INotificationService
{
    Task<NotificationResponseDto> SendAsync(SendNotificationDto dto);
    Task<IList<NotificationResponseDto>> SendBulkAsync(BroadcastNotificationDto dto);
    Task<IList<NotificationResponseDto>> GetByRecipientAsync(int recipientId);
    Task<IList<NotificationResponseDto>> GetUnreadAsync(int recipientId);
    Task<int> GetUnreadCountAsync(int recipientId);
    Task<NotificationResponseDto> MarkAsReadAsync(int notificationId);
    Task MarkAllReadAsync(int recipientId);
    Task<bool> DeleteAsync(int notificationId);
    Task<PagedResult<NotificationResponseDto>> GetAllAsync(int page, int pageSize);
}