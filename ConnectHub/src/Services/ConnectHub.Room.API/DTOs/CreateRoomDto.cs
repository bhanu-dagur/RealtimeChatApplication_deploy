using System.ComponentModel.DataAnnotations;
using ConnectHub.Shared.Enums;

namespace ConnectHub.Room.API.DTOs;

public class CreateRoomDto
{
    [Required, MaxLength(100)]
    public string RoomName { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    public RoomType RoomType { get; set; } = RoomType.PUBLIC;

    public string? AvatarUrl { get; set; }

    [Required]
    public int CreatedBy { get; set; }

    // Optional member list to add at creation time. Creator is always added as ADMIN
    // automatically; these get role MEMBER. Duplicates and the creator's own id are de-duped.
    public List<int>? InitialMemberIds { get; set; }
}