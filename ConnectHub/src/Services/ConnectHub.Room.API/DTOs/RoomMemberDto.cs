using ConnectHub.Shared.Enums;

namespace ConnectHub.Room.API.DTOs;

public class RoomMemberDto
{
    public int MemberId { get; set; }
    public int RoomId { get; set; }
    public int UserId { get; set; }
    public MemberRole Role { get; set; }
    public DateTime JoinedAt { get; set; }
}