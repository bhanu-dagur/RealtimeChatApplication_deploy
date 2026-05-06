using System.ComponentModel.DataAnnotations;

namespace ConnectHub.Room.API.DTOs;

public class AddMemberDto
{
    [Required]
    public int UserId { get; set; }
    
    [Required]
    public int RoomId { get; set; }
}