using ConnectHub.Shared.Enums;

namespace ConnectHub.Room.API.Models;

public class RoomMember
{
    public int MemberId { get; set; }

    public int RoomId { get; set; }

    public int UserId { get; set; }

    public MemberRole Role { get; set; } = MemberRole.MEMBER;

    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;

    public bool IsActive { get; set; } = true;

    // Navigation property
    public ChatRoom? ChatRoom { get; set; }
}