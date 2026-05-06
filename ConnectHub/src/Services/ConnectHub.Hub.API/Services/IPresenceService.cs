using ConnectHub.Hub.API.Models;

namespace ConnectHub.Hub.API.Services;

public interface IPresenceService
{
    // When User connected
    Task UserConnectedAsync(int userId, string userName, string connectionId);

    // When User disconnected
    Task UserDisconnectedAsync(int userId, string connectionId);

    // All Connection of the user (in case of multiple tabs)
    Task<IList<string>> GetConnectionsByUserIdAsync(int userId);

    // User is online or Not
    Task<bool> IsUserOnlineAsync(int userId);

    // List of all online users
    Task<IList<int>> GetOnlineUserIdsAsync();

    // Detail info of all online users
    Task<IList<UserConnection>> GetOnlineUsersInfoAsync();

    // Total online count
    Task<int> GetOnlineCountAsync();

    // clean all connections of the specific user
    Task ClearUserConnectionsAsync(int userId);
}