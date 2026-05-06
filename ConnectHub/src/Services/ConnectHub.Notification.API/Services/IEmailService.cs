using ConnectHub.Notification.API.DTOs;

namespace ConnectHub.Notification.API.Services;

public interface IEmailService
{
    Task SendEmailAsync(EmailNotificationDto dto);
}