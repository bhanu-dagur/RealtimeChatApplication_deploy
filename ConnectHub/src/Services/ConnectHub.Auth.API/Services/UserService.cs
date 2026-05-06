using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Google.Apis.Auth;
using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.Tokens;
using ConnectHub.Auth.API.DTOs;
using ConnectHub.Auth.API.Models;
using ConnectHub.Auth.API.Repositories;

namespace ConnectHub.Auth.API.Services;

public class UserService : IUserService
{
    private readonly IUserRepository _repo;
    private readonly IConfiguration _config;
    private readonly PasswordHasher<User> _hasher = new();

    public UserService(IUserRepository repo, IConfiguration config)
    {
        _repo = repo;
        _config = config;
    }

    public async Task<AuthResponseDto> RegisterAsync(RegisterDto dto)
    {
        if (await _repo.ExistsByEmailAsync(dto.Email))
            throw new InvalidOperationException("Email already registered.");

        if (await _repo.ExistsByUserNameAsync(dto.UserName))
            throw new InvalidOperationException("Username already taken.");

        var user = new User
        {
            UserName = dto.UserName,
            DisplayName = dto.DisplayName,
            Email = dto.Email
        };
        user.PasswordHash = _hasher.HashPassword(user, dto.Password);

        var created = await _repo.CreateAsync(user);
        return BuildAuthResponse(created);
    }

    public async Task<AuthResponseDto> LoginAsync(LoginDto dto)
    {
        var user = await _repo.FindByEmailAsync(dto.Email)
            ?? throw new UnauthorizedAccessException("Invalid email or password.");

        var result = _hasher.VerifyHashedPassword(user, user.PasswordHash, dto.Password);
        if (result == PasswordVerificationResult.Failed)
            throw new UnauthorizedAccessException("Invalid email or password.");

        await _repo.UpdateOnlineStatusAsync(user.UserId, true);
        return BuildAuthResponse(user);
    }

    public async Task<AuthResponseDto> LoginWithGoogleAsync(string idToken)
    {
        var clientId = _config["Google:ClientId"];
        if (string.IsNullOrWhiteSpace(clientId))
            throw new InvalidOperationException("Google Client ID is not configured.");

        // Verifies signature, expiry, issuer, AND that the audience matches
        // *our* OAuth client id — otherwise an attacker could replay a token
        // issued for a different app and we'd happily mint a session.
        var settings = new GoogleJsonWebSignature.ValidationSettings
        {
            Audience = new[] { clientId }
        };

        GoogleJsonWebSignature.Payload payload;
        try
        {
            payload = await GoogleJsonWebSignature.ValidateAsync(idToken, settings);
        }
        catch (InvalidJwtException)
        {
            throw new UnauthorizedAccessException("Invalid Google token.");
        }

        // 1. Match by GoogleId (cheapest, primary path on returning sign-in).
        // 2. Else match by email — links a Google sign-in to an existing
        //    email/password account so the same person doesn't end up with
        //    two rows when they later try one method after the other.
        // 3. Else create a fresh account.
        var user = await _repo.FindByGoogleIdAsync(payload.Subject);
        if (user is null)
        {
            user = await _repo.FindByEmailAsync(payload.Email);
            if (user is not null)
            {
                user.GoogleId = payload.Subject;
                if (string.IsNullOrEmpty(user.AvatarUrl) && !string.IsNullOrEmpty(payload.Picture))
                    user.AvatarUrl = payload.Picture;
                user = await _repo.UpdateAsync(user);
            }
        }

        if (user is null)
        {
            var userName = await GenerateUniqueUserNameAsync(payload.Email);
            user = new User
            {
                Email = payload.Email,
                UserName = userName,
                DisplayName = payload.Name ?? userName,
                AvatarUrl = payload.Picture,
                GoogleId = payload.Subject,
                // Empty password hash — a Google-only user has no local password.
                // They can set one later via the password-reset flow.
                PasswordHash = string.Empty
            };
            user = await _repo.CreateAsync(user);
        }

        await _repo.UpdateOnlineStatusAsync(user.UserId, true);
        return BuildAuthResponse(user);
    }

    public async Task<UserProfileDto?> GetUserByIdAsync(int userId)
    {
        var user = await _repo.FindByUserIdAsync(userId);
        return user is null ? null : MapToProfile(user);
    }

    public async Task<UserProfileDto?> GetUserByUserNameAsync(string userName)
    {
        var user = await _repo.FindByUserNameAsync(userName);
        return user is null ? null : MapToProfile(user);
    }

    public async Task<UserProfileDto> UpdateProfileAsync(int userId, UpdateProfileDto dto)
    {
        var user = await _repo.FindByUserIdAsync(userId)
            ?? throw new KeyNotFoundException("User not found.");

        if (dto.DisplayName is not null) user.DisplayName = dto.DisplayName;
        if (dto.Bio is not null) user.Bio = dto.Bio;
        if (dto.AvatarUrl is not null) user.AvatarUrl = dto.AvatarUrl;

        var updated = await _repo.UpdateAsync(user);
        return MapToProfile(updated);
    }

    public async Task<bool> ChangePasswordAsync(int userId, string oldPassword, string newPassword)
    {
        var user = await _repo.FindByUserIdAsync(userId)
            ?? throw new KeyNotFoundException("User not found.");

        var result = _hasher.VerifyHashedPassword(user, user.PasswordHash, oldPassword);
        if (result == PasswordVerificationResult.Failed) return false;

        user.PasswordHash = _hasher.HashPassword(user, newPassword);
        await _repo.UpdateAsync(user);
        return true;
    }

    public async Task<IList<UserProfileDto>> SearchUsersAsync(string query)
    {
        var users = await _repo.SearchUsersAsync(query);
        return users.Select(MapToProfile).ToList();
    }

    public async Task SetOnlineStatusAsync(int userId, bool isOnline) =>
        await _repo.UpdateOnlineStatusAsync(userId, isOnline);

    public async Task<IList<UserProfileDto>> GetAllActiveUsersAsync()
    {
        var users = await _repo.FindAllActiveAsync();
        return users.Select(MapToProfile).ToList();
    }

    public async Task<bool> DeactivateAccountAsync(int userId)
    {
        var user = await _repo.FindByUserIdAsync(userId);
        if (user is null) return false;
        user.IsActive = false;
        await _repo.UpdateAsync(user);
        return true;
    }

    // ── Private helpers ──────────────────────────────────────────

    // Derives a unique username from the email's local-part (e.g. "alice.smith"
    // → "alicesmith", suffixing "1", "2", ... until free). Avoids forcing
    // first-time Google users through a username-picker before they can chat.
    private async Task<string> GenerateUniqueUserNameAsync(string email)
    {
        var basePart = email.Split('@')[0]
            .ToLowerInvariant()
            .Replace(".", "")
            .Replace("+", "");
        if (string.IsNullOrWhiteSpace(basePart)) basePart = "user";

        var candidate = basePart;
        var suffix = 0;
        while (await _repo.ExistsByUserNameAsync(candidate))
        {
            suffix++;
            candidate = $"{basePart}{suffix}";
        }
        return candidate;
    }

    private AuthResponseDto BuildAuthResponse(User user)
    {
        var expiry = DateTime.UtcNow.AddMinutes(60);
        return new AuthResponseDto
        {
            UserId = user.UserId,
            UserName = user.UserName,
            DisplayName = user.DisplayName,
            Email = user.Email,
            AvatarUrl = user.AvatarUrl,
            Token = GenerateJwt(user, expiry),
            TokenExpiry = expiry
        };
    }

    private string GenerateJwt(User user, DateTime expiry)
    {
        var key = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes(_config["Jwt:Key"]!));

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.UserId.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim("username", user.UserName),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        var token = new JwtSecurityToken(
            issuer: _config["Jwt:Issuer"],
            audience: _config["Jwt:Audience"],
            claims: claims,
            expires: expiry,
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256)
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static UserProfileDto MapToProfile(User u) => new()
    {
        UserId = u.UserId,
        UserName = u.UserName,
        DisplayName = u.DisplayName,
        Email = u.Email,
        AvatarUrl = u.AvatarUrl,
        Bio = u.Bio,
        IsOnline = u.IsOnline,
        LastSeen = u.LastSeen,
        CreatedAt = u.CreatedAt
    };
}