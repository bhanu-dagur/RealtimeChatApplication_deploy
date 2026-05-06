using ConnectHub.Shared.Enums;

namespace ConnectHub.Room.API.DTOs;

public class ChatRoomResponseDto
{
    public int RoomId { get; set; }
    public string RoomName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public RoomType RoomType { get; set; }
    public string? AvatarUrl { get; set; }
    public int CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; }
    public int MaxMembers { get; set; }
    public int MemberCount { get; set; }
}