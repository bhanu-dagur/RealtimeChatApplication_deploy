using System.Collections.Concurrent;
using ConnectHub.Hub.API.Models;

namespace ConnectHub.Hub.API.Services;

public class PresenceService : IPresenceService
{
    // UserId → set of connection ids. Inner ConcurrentDictionary<string, byte> gives us
    // a thread-safe set without taking a lock for every read — the previous HashSet
    // implementation would throw "Collection was modified" if a reader called .ToList()
    // while another thread mutated the set.
    private readonly ConcurrentDictionary<int, ConcurrentDictionary<string, byte>> _userConnections = new();
    private readonly ConcurrentDictionary<string, UserConnection> _connectionDetails = new();

    public Task UserConnectedAsync(int userId, string userName, string connectionId)
    {
        var bag = _userConnections.GetOrAdd(userId, _ => new ConcurrentDictionary<string, byte>());
        bag.TryAdd(connectionId, 0);

        _connectionDetails[connectionId] = new UserConnection
        {
            ConnectionId = connectionId,
            UserId = userId,
            UserName = userName,
            ConnectedAt = DateTime.UtcNow
        };

        return Task.CompletedTask;
    }

    public Task UserDisconnectedAsync(int userId, string connectionId)
    {
        if (_userConnections.TryGetValue(userId, out var bag))
        {
            bag.TryRemove(connectionId, out _);
            if (bag.IsEmpty)
                _userConnections.TryRemove(userId, out _);
        }
        _connectionDetails.TryRemove(connectionId, out _);
        return Task.CompletedTask;
    }

    public Task<IList<string>> GetConnectionsByUserIdAsync(int userId)
    {
        if (_userConnections.TryGetValue(userId, out var bag))
            return Task.FromResult<IList<string>>(bag.Keys.ToList());
        return Task.FromResult<IList<string>>(new List<string>());
    }

    public Task<bool> IsUserOnlineAsync(int userId) =>
        Task.FromResult(_userConnections.ContainsKey(userId));

    public Task<IList<int>> GetOnlineUserIdsAsync() =>
        Task.FromResult<IList<int>>(_userConnections.Keys.ToList());

    public Task<IList<UserConnection>> GetOnlineUsersInfoAsync() =>
        Task.FromResult<IList<UserConnection>>(_connectionDetails.Values.ToList());

    public Task<int> GetOnlineCountAsync() =>
        Task.FromResult(_userConnections.Count);

    public Task ClearUserConnectionsAsync(int userId)
    {
        if (_userConnections.TryRemove(userId, out var bag))
        {
            foreach (var connId in bag.Keys)
                _connectionDetails.TryRemove(connId, out _);
        }
        return Task.CompletedTask;
    }
}
