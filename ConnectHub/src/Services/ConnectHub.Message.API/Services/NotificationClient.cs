using System.Net.Http.Headers;
using System.Net.Http.Json;
using ConnectHub.Shared.Enums;
using Microsoft.AspNetCore.Http;

namespace ConnectHub.Message.API.Services;

public class NotificationClient : INotificationClient
{
    private readonly HttpClient _http;
    private readonly IHttpContextAccessor _httpContext;
    private readonly ILogger<NotificationClient> _logger;

    public NotificationClient(
        HttpClient http,
        IHttpContextAccessor httpContext,
        ILogger<NotificationClient> logger)
    {
        _http = http;
        _httpContext = httpContext;
        _logger = logger;
    }

    public async Task SendAsync(
        int recipientId,
        int? senderId,
        NotificationType type,
        string title,
        string message,
        int? relatedId,
        CancellationToken ct = default)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, "/api/notifications/send")
        {
            Content = JsonContent.Create(new
            {
                recipientId,
                senderId,
                type = type.ToString(),
                title,
                message,
                relatedId
            })
        };

        // Forward the caller's JWT so Notification.API's [Authorize] accepts it.
        var auth = _httpContext.HttpContext?.Request.Headers["Authorization"].ToString();
        
        // If not in headers (e.g. SignalR hub call), check query string
        if (string.IsNullOrWhiteSpace(auth))
        {
            auth = _httpContext.HttpContext?.Request.Query["access_token"];
            if (!string.IsNullOrWhiteSpace(auth) && !auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            {
                auth = "Bearer " + auth;
            }
        }

        if (!string.IsNullOrWhiteSpace(auth) && auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            req.Headers.Authorization = AuthenticationHeaderValue.Parse(auth);
        }

        try
        {
            var res = await _http.SendAsync(req, ct);
            if (!res.IsSuccessStatusCode)
            {
                var body = await res.Content.ReadAsStringAsync(ct);
                _logger.LogWarning(
                    "Notification dispatch failed for recipient {RecipientId}: {Status} {Body}",
                    recipientId, (int)res.StatusCode, body);
            }
        }
        catch (Exception ex)
        {
            // Notification is best-effort; never break the parent flow.
            _logger.LogWarning(ex,
                "Notification dispatch threw for recipient {RecipientId}", recipientId);
        }
    }
}
