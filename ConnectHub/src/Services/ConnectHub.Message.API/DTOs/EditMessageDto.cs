using System.ComponentModel.DataAnnotations;

namespace ConnectHub.Message.API.DTOs;

public class EditMessageDto
{
    [Required,MaxLength(2000)]
    public string Content { get; set; } = string.Empty;
}