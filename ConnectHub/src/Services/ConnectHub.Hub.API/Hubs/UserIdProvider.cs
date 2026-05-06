using Microsoft.AspNetCore.SignalR;
using System.Security.Claims;

namespace ConnectHub.Hub.API.Hubs;

// JWT token se UserId nikalta hai
// Isse Clients.User(userId) kaam karta hai
public class UserIdProvider : IUserIdProvider
{
    public string? GetUserId(HubConnectionContext connection)
    {
        // JWT mein "sub" claim mein UserId hota hai
        return connection.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? connection.User?.FindFirst("sub")?.Value;
    }
}