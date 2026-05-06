using System.ComponentModel.DataAnnotations;
using ConnectHub.Shared.Enums;

namespace ConnectHub.Room.API.DTOs;

public class UpdateMemberRoleDto
{
    [Required]
    public int UserId {get; set;}

    [Required]
    public int RoomId {get; set;}

    [Required]
    public MemberRole NewRole {get; set;}
}