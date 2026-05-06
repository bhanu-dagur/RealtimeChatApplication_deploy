using Microsoft.EntityFrameworkCore;
using ConnectHub.Auth.API.Data;
using ConnectHub.Auth.API.Models;

namespace ConnectHub.Auth.API.Repositories;

public class UserRepository : IUserRepository
{
    private readonly AuthDbContext _context;

    public UserRepository(AuthDbContext context)
    {
        _context = context;
    }

    public async Task<User?> FindByEmailAsync(string email) =>
        await _context.Users.FirstOrDefaultAsync(u => u.Email == email && u.IsActive);

    public async Task<User?> FindByUserIdAsync(int userId) =>
        await _context.Users.FirstOrDefaultAsync(u => u.UserId == userId && u.IsActive);

    public async Task<User?> FindByUserNameAsync(string userName) =>
        await _context.Users.FirstOrDefaultAsync(u => u.UserName == userName && u.IsActive);

    public async Task<User?> FindByGoogleIdAsync(string googleId) =>
        await _context.Users.FirstOrDefaultAsync(u => u.GoogleId == googleId && u.IsActive);

    public async Task<bool> ExistsByEmailAsync(string email) =>
        await _context.Users.AnyAsync(u => u.Email == email);

    public async Task<bool> ExistsByUserNameAsync(string userName) =>
        await _context.Users.AnyAsync(u => u.UserName == userName);

    public async Task<IList<User>> FindAllActiveAsync() =>
        await _context.Users.Where(u => u.IsActive).ToListAsync();

    public async Task<IList<User>> SearchUsersAsync(string query) =>
        await _context.Users
            .Where(u => u.IsActive &&
                (u.UserName.Contains(query) || u.DisplayName.Contains(query)))
            .ToListAsync();

    public async Task<User> CreateAsync(User user)
    {
        _context.Users.Add(user);
        await _context.SaveChangesAsync();
        return user;
    }

    public async Task<User> UpdateAsync(User user)
    {
        _context.Users.Update(user);
        await _context.SaveChangesAsync();
        return user;
    }

    public async Task UpdateOnlineStatusAsync(int userId, bool isOnline)
    {
        var user = await _context.Users.FindAsync(userId);
        if (user is null) return;

        user.IsOnline = isOnline;
        user.LastSeen = DateTime.UtcNow;
        await _context.SaveChangesAsync();
    }
}