namespace ConnectHub.Hub.API.Services;

/// <summary>
/// Service to sync user online/offline status with Auth API database
/// </summary>
public interface IUserStatusService
{
    Task UpdateUserOnlineStatusAsync(int userId, bool isOnline);
}
