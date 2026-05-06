using ConnectHub.Notification.API.Models;

namespace ConnectHub.Notification.API.Repositories;

public interface INotificationRepository
{
    Task<NotificationEntity?> FindByIdAsync(int notificationId);
    Task<IList<NotificationEntity>> FindUnreadByRecipientIdAsync(int recipientId);
    Task<IList<NotificationEntity>> FindByRecipientIdAsync(int recipientId);
    Task<int> CountUnreadByRecipientIdAsync(int recipientId);
    Task<IList<NotificationEntity>> FindAllAsync();
    Task<NotificationEntity> CreateAsync(NotificationEntity notification);
    Task<IList<NotificationEntity>> CreateManyAsync(IList<NotificationEntity> notifications);
    Task<NotificationEntity> UpdateAsync(NotificationEntity notification);
    Task MarkAllReadByRecipientIdAsync(int recipientId);
    Task<bool> DeleteAsync(int notificationId);
}