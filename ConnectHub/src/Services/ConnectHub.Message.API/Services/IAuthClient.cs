namespace ConnectHub.Message.API.Services;

public interface IAuthClient
{
    Task<int?> GetUserIdByUserNameAsync(string userName, CancellationToken ct = default);
}
