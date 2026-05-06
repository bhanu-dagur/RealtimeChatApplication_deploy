using ConnectHub.Auth.API.DTOs;
using ConnectHub.Auth.API.Models;

namespace ConnectHub.Auth.API.Services;

public interface IUserService
{
    Task<AuthResponseDto> RegisterAsync(RegisterDto dto);
    Task<AuthResponseDto> LoginAsync(LoginDto dto);
    Task<AuthResponseDto> LoginWithGoogleAsync(string idToken);
    Task<UserProfileDto?> GetUserByIdAsync(int userId);
    Task<UserProfileDto?> GetUserByUserNameAsync(string userName);
    Task<UserProfileDto> UpdateProfileAsync(int userId, UpdateProfileDto dto);
    Task<bool> ChangePasswordAsync(int userId, string oldPassword, string newPassword);
    Task<IList<UserProfileDto>> SearchUsersAsync(string query);
    Task SetOnlineStatusAsync(int userId, bool isOnline);
    Task<IList<UserProfileDto>> GetAllActiveUsersAsync();
    Task<bool> DeactivateAccountAsync(int userId);
}