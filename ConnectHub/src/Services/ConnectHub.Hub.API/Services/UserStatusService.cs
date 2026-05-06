namespace ConnectHub.Hub.API.Services;

public class UserStatusService : IUserStatusService
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<UserStatusService> _logger;

    public UserStatusService(HttpClient httpClient, ILogger<UserStatusService> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
    }

    public async Task UpdateUserOnlineStatusAsync(int userId, bool isOnline)
    {
        try
        {
            // PUT /api/users/{id}/online-status on Auth API.
            // The DTO property is `IsOnline` (PascalCase) — Auth API does not register
            // a camelCase JSON contract for input, so always serialize that exact name.
            var request = new HttpRequestMessage(HttpMethod.Put, $"/api/users/{userId}/online-status")
            {
                Content = JsonContent.Create(new { IsOnline = isOnline })
            };

            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            var response = await _httpClient.SendAsync(request, cts.Token);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning(
                    "Auth API rejected online-status update for user {UserId}. Status: {StatusCode}",
                    userId, response.StatusCode);
            }
        }
        catch (TaskCanceledException)
        {
            _logger.LogWarning("Online-status update for user {UserId} timed out — Auth API slow or unreachable.", userId);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Online-status update for user {UserId} failed (Auth API unreachable).", userId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error updating online status for user {UserId}", userId);
            // Never throw — presence in-memory still works even if DB sync fails.
        }
    }
}
