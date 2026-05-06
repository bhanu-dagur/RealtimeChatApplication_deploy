using Microsoft.EntityFrameworkCore;
using ConnectHub.Notification.API.Data;
using ConnectHub.Notification.API.Models;

namespace ConnectHub.Notification.API.Repositories;

public class NotificationRepository : INotificationRepository
{
    private readonly NotificationDbContext _context;

    public NotificationRepository(NotificationDbContext context)
    {
        _context = context;
    }
    public async Task<NotificationEntity?> FindByIdAsync(int notificationId) =>
        await _context.Notifications
            .FirstOrDefaultAsync(n => n.NotificationId == notificationId);

    public async Task<IList<NotificationEntity>> FindByRecipientIdAsync(int recipientId) =>
        await _context.Notifications
            .Where(n => n.RecipientId == recipientId)
            .OrderByDescending(n => n.SentAt)
            .ToListAsync();

    public async Task<IList<NotificationEntity>> FindUnreadByRecipientIdAsync(int recipientId) =>
        await _context.Notifications
            .Where(n => n.RecipientId == recipientId && !n.IsRead)
            .OrderByDescending(n => n.SentAt)
            .ToListAsync();

    public async Task<int> CountUnreadByRecipientIdAsync(int recipientId) =>
        await _context.Notifications
            .CountAsync(n => n.RecipientId == recipientId && !n.IsRead);

    public async Task<IList<NotificationEntity>> FindAllAsync() =>
        await _context.Notifications
            .OrderByDescending(n => n.SentAt)
            .ToListAsync();

    public async Task<NotificationEntity> CreateAsync(NotificationEntity notification)
    {
        _context.Notifications.Add(notification);
        await _context.SaveChangesAsync();
        return notification;
    }

    public async Task<IList<NotificationEntity>> CreateManyAsync(IList<NotificationEntity> notifications)
    {
        _context.Notifications.AddRange(notifications);
        await _context.SaveChangesAsync();
        return notifications;
    }

    public async Task<NotificationEntity> UpdateAsync(NotificationEntity notification)
    {
        _context.Notifications.Update(notification);
        await _context.SaveChangesAsync();
        return notification;
    }

    public async Task MarkAllReadByRecipientIdAsync(int recipientId)
    {
        var unread = await _context.Notifications
            .Where(n => n.RecipientId == recipientId && !n.IsRead)
            .ToListAsync();

        foreach (var n in unread)
        {
            n.IsRead = true;
            n.ReadAt = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync();
    }

    public async Task<bool> DeleteAsync(int notificationId)
    {
        var notification = await _context.Notifications.FindAsync(notificationId);
        if (notification is null) return false;
        _context.Notifications.Remove(notification);
        await _context.SaveChangesAsync();
        return true;
    }
}