namespace ConnectHub.Hub.API.Models;

public class UserConnection
{
    public string ConnectionId { get; set; } = string.Empty;
    public int UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public DateTime ConnectedAt { get; set; } = DateTime.UtcNow;
}