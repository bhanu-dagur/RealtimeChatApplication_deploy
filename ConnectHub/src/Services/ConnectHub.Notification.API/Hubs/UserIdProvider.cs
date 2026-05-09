using Microsoft.AspNetCore.SignalR;
using System.Security.Claims;

namespace ConnectHub.Notification.API.Hubs;

public class UserIdProvider : IUserIdProvider
{
    public string? GetUserId(HubConnectionContext connection)
    {
        // Check for common JWT claims for user ID
        return connection.User?.FindFirst("sub")?.Value
            ?? connection.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? connection.User?.FindFirst("uid")?.Value;
    }
}
