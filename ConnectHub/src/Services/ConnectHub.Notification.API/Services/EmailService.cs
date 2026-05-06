using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;
using ConnectHub.Notification.API.DTOs;

namespace ConnectHub.Notification.API.Services;

public class EmailService : IEmailService
{
    private readonly IConfiguration _config;
    private readonly ILogger<EmailService> _logger;

    public EmailService(IConfiguration config, ILogger<EmailService> logger)
    {
        _config = config;
        _logger = logger;
    }

    public async Task SendEmailAsync(EmailNotificationDto dto)
    {
        try
        {
            var email = new MimeMessage();

            // From
            email.From.Add(new MailboxAddress(
                _config["Email:SenderName"] ?? "ConnectHub",
                _config["Email:SenderEmail"] ?? "noreply@connecthub.com"));

            // To
            email.To.Add(new MailboxAddress(dto.ToName, dto.ToEmail));

            email.Subject = dto.Subject;

            // HTML body
            var bodyBuilder = new BodyBuilder
            {
                HtmlBody = $@"
                    <div style='font-family: Arial, sans-serif; max-width: 600px;'>
                        <h2 style='color: #4F46E5;'>ConnectHub</h2>
                        <h3>{dto.Subject}</h3>
                        <p>{dto.Body}</p>
                        <hr/>
                        <small style='color: #888;'>
                            Yeh email ConnectHub ne bheja hai.
                        </small>
                    </div>",
                TextBody = dto.Body
            };

            email.Body = bodyBuilder.ToMessageBody();

            using var smtp = new SmtpClient();

            await smtp.ConnectAsync(
                _config["Email:SmtpHost"] ?? "smtp.gmail.com",
                int.Parse(_config["Email:SmtpPort"] ?? "587"),
                SecureSocketOptions.StartTls);

            await smtp.AuthenticateAsync(
                _config["Email:UserName"],
                _config["Email:Password"]);

            await smtp.SendAsync(email);
            await smtp.DisconnectAsync(true);

            _logger.LogInformation("Email sent to {Email}", dto.ToEmail);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Email bhejne mein error aaya: {Email}", dto.ToEmail);
            // Email fail hone par app crash na ho
        }
    }
}