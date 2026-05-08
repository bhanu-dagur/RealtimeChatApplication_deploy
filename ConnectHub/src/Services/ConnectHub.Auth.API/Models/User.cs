using System.ComponentModel.DataAnnotations;

namespace ConnectHub.Auth.API.Models;

public class User
{
    public int UserId { get; set; }

    [Required, MaxLength(50)]
    public string UserName { get; set; } = string.Empty;

    [Required, MaxLength(100)]
    public string DisplayName { get; set; } = string.Empty;

    [Required, MaxLength(150)]
    public string Email { get; set; } = string.Empty;

    public string PasswordHash { get; set; } = string.Empty;

    public string? AvatarUrl { get; set; }

    [MaxLength(300)]
    public string? Bio { get; set; }

    public bool IsOnline { get; set; } = false;

    public DateTime? LastSeen { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public bool IsActive { get; set; } = true;
    public bool IsSystemAdmin { get; set; } = false;

    // OAuth provider info
    public string? GoogleId { get; set; }
    public string? GitHubId { get; set; }
}