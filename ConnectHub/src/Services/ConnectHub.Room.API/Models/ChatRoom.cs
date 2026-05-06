using System.ComponentModel.DataAnnotations;
using ConnectHub.Shared.Enums;

namespace ConnectHub.Room.API.Models;

public class ChatRoom
{
    public int RoomId { get; set; }

    [Required, MaxLength(100)]
    public string RoomName { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    public RoomType RoomType { get; set; } = RoomType.PUBLIC;

    public string? AvatarUrl { get; set; }

    // Room banane wala user
    public int CreatedBy { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public bool IsActive { get; set; } = true;

    // Max 500 members allowed
    public int MaxMembers { get; set; } = 500;

    // Navigation property
    public ICollection<RoomMember> Members { get; set; } = new List<RoomMember>();
}