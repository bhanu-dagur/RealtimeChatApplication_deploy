using ConnectHub.Auth.API.Models;

namespace ConnectHub.Auth.API.Repositories;

public interface IUserRepository
{
    Task<User?> FindByEmailAsync(string email);
    Task<User?> FindByUserIdAsync(int userId);
    Task<User?> FindByUserNameAsync(string userName);
    Task<User?> FindByGoogleIdAsync(string googleId);
    Task<bool> ExistsByEmailAsync(string email);
    Task<bool> ExistsByUserNameAsync(string userName);
    Task<IList<User>> FindAllActiveAsync();
    Task<IList<User>> SearchUsersAsync(string query);
    Task<User> CreateAsync(User user);
    Task<User> UpdateAsync(User user);
    Task UpdateOnlineStatusAsync(int userId, bool isOnline);
    Task<IList<User>> FindAllIncludingInactiveAsync();
    Task<User?> FindAnyByIdAsync(int userId);
    Task<bool> HardDeleteAsync(int userId);
    Task<int> CountUsersAsync();
}