using System.ComponentModel.DataAnnotations;

namespace ConnectHub.Room.API.DTOs;

public class UpdateRoomDto
{
    [MaxLength(100)]
    public string? RoomName { get; set; }

    [MaxLength(500)]
    public string? Description { get; set; }

    public string? AvatarUrl { get; set; }
}