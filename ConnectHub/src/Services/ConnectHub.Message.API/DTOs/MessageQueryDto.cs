namespace ConnectHub.Message.API.DTOs;

public class MessageQueryDto
{
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 20;
    public string? Keyword { get; set; }
}