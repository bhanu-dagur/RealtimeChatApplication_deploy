using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ConnectHub.Hub.API.Models;
using ConnectHub.Hub.API.Services;
using ConnectHub.Shared.Models;

namespace ConnectHub.Hub.API.Controllers;

[ApiController]
[Route("api/presence")]
[Authorize]
public class PresenceController : ControllerBase
{
    private readonly IPresenceService _presence;

    public PresenceController(IPresenceService presence)
    {
        _presence = presence;
    }

    // GET api/presence/online
    [HttpGet("online")]
    public async Task<IActionResult> GetOnlineUsers()
    {
        var users = await _presence.GetOnlineUserIdsAsync();
        return Ok(ApiResponse<IList<int>>.Ok(users));
    }

    // GET api/presence/online/count
    [HttpGet("online/count")]
    public async Task<IActionResult> GetOnlineCount()
    {
        var count = await _presence.GetOnlineCountAsync();
        return Ok(ApiResponse<int>.Ok(count));
    }

    // GET api/presence/online/info
    [HttpGet("online/info")]
    public async Task<IActionResult> GetOnlineUsersInfo()
    {
        var info = await _presence.GetOnlineUsersInfoAsync();
        return Ok(ApiResponse<IList<UserConnection>>.Ok(info));
    }

    // GET api/presence/isonline/{userId}
    [HttpGet("isonline/{userId:int}")]
    public async Task<IActionResult> IsOnline(int userId)
    {
        var online = await _presence.IsUserOnlineAsync(userId);
        return Ok(ApiResponse<bool>.Ok(online));
    }

    // GET api/presence/connections/{userId}
    [HttpGet("connections/{userId:int}")]
    public async Task<IActionResult> GetConnections(int userId)
    {
        var connections = await _presence.GetConnectionsByUserIdAsync(userId);
        return Ok(ApiResponse<IList<string>>.Ok(connections));
    }
}