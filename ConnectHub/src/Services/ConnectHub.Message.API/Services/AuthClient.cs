using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Http;
using ConnectHub.Shared.Models;

namespace ConnectHub.Message.API.Services;

public class AuthClient : IAuthClient
{
    private readonly HttpClient _http;
    private readonly IHttpContextAccessor _httpContext;
    private readonly ILogger<AuthClient> _logger;

    public AuthClient(
        HttpClient http,
        IHttpContextAccessor httpContext,
        ILogger<AuthClient> logger)
    {
        _http = http;
        _httpContext = httpContext;
        _logger = logger;
    }

    public async Task<int?> GetUserIdByUserNameAsync(string userName, CancellationToken ct = default)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, $"/api/users/by-username/{userName}");

        // Forward token
        var auth = _httpContext.HttpContext?.Request.Headers["Authorization"].ToString();
        if (string.IsNullOrWhiteSpace(auth))
        {
            auth = _httpContext.HttpContext?.Request.Query["access_token"];
            if (!string.IsNullOrWhiteSpace(auth) && !auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
                auth = "Bearer " + auth;
        }

        if (!string.IsNullOrWhiteSpace(auth))
            req.Headers.Authorization = AuthenticationHeaderValue.Parse(auth);

        try
        {
            var res = await _http.SendAsync(req, ct);
            if (!res.IsSuccessStatusCode) return null;

            var result = await res.Content.ReadFromJsonAsync<ApiResponse<UserProfileDto>>(cancellationToken: ct);
            return result?.Data?.UserId;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to lookup user by username: {UserName}", userName);
            return null;
        }
    }
}

public class UserProfileDto
{
    public int UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
}
