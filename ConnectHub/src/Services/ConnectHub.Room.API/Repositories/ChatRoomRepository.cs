using Microsoft.EntityFrameworkCore;
using ConnectHub.Room.API.Data;
using ConnectHub.Room.API.Models;

namespace ConnectHub.Room.API.Repositories;

public class ChatRoomRepository : IChatRoomRepository
{
    private readonly RoomDbContext _context;

    public ChatRoomRepository(RoomDbContext context)
    {
        _context = context;
    }

    public async Task<ChatRoom?> FindByIdAsync(int roomId) =>
        await _context.ChatRooms
            .Include(r => r.Members)
            .FirstOrDefaultAsync(r => r.RoomId == roomId);

    public async Task<IList<ChatRoom>> FindPublicRoomsAsync() =>
        await _context.ChatRooms
            .Where(r => r.RoomType == ConnectHub.Shared.Enums.RoomType.PUBLIC)
            .Include(r => r.Members)
            .OrderBy(r => r.RoomName)
            .ToListAsync();

    public async Task<IList<ChatRoom>> FindRoomsByUserIdAsync(int userId) =>
        await _context.ChatRooms
            .Where(r => r.Members.Any(m => m.UserId == userId))
            .Include(r => r.Members)
            .ToListAsync();

    public async Task<ChatRoom> CreateAsync(ChatRoom room)
    {
        _context.ChatRooms.Add(room);
        await _context.SaveChangesAsync();
        return room;
    }

    public async Task<ChatRoom> UpdateAsync(ChatRoom room)
    {
        _context.ChatRooms.Update(room);
        await _context.SaveChangesAsync();
        return room;
    }

    public async Task<bool> DeleteAsync(int roomId)
    {
        var room = await _context.ChatRooms.FindAsync(roomId);
        if (room is null) return false;
        room.IsActive = false;
        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<IList<ChatRoom>> FindAllRoomsAdminAsync() =>
        await _context.ChatRooms.IgnoreQueryFilters().ToListAsync();

    public async Task<int> CountRoomsAsync() =>
        await _context.ChatRooms.IgnoreQueryFilters().CountAsync();

    // ── Member operations ─────────────────────────────────────────

    public async Task<RoomMember?> FindMemberAsync(int roomId, int userId) =>
        await _context.RoomMembers
            .FirstOrDefaultAsync(m => m.RoomId == roomId && m.UserId == userId);

    // Bypasses the IsActive query filter so we can reactivate a soft-deleted membership
    // row when a user rejoins (the unique index on (RoomId, UserId) is not filtered).
    public async Task<RoomMember?> FindMemberIncludingInactiveAsync(int roomId, int userId) =>
        await _context.RoomMembers
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(m => m.RoomId == roomId && m.UserId == userId);

    public async Task<IList<RoomMember>> FindMembersByRoomIdAsync(int roomId) =>
        await _context.RoomMembers
            .Where(m => m.RoomId == roomId)
            .ToListAsync();

    public async Task<bool> IsUserInRoomAsync(int roomId, int userId) =>
        await _context.RoomMembers
            .AnyAsync(m => m.RoomId == roomId && m.UserId == userId);

    public async Task<int> CountMembersAsync(int roomId) =>
        await _context.RoomMembers
            .CountAsync(m => m.RoomId == roomId);

    public async Task<RoomMember> AddMemberAsync(RoomMember member)
    {
        _context.RoomMembers.Add(member);
        await _context.SaveChangesAsync();
        return member;
    }

    public async Task<RoomMember> UpdateMemberAsync(RoomMember member)
    {
        _context.RoomMembers.Update(member);
        await _context.SaveChangesAsync();
        return member;
    }

    public async Task<bool> RemoveMemberAsync(int roomId, int userId)
    {
        var member = await _context.RoomMembers
            .FirstOrDefaultAsync(m => m.RoomId == roomId && m.UserId == userId);
        if (member is null) return false;
        member.IsActive = false;
        await _context.SaveChangesAsync();
        return true;
    }
}