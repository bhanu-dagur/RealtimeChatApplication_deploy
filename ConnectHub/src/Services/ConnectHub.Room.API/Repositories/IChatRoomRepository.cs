using ConnectHub.Room.API.Models;

namespace ConnectHub.Room.API.Repositories;

public interface IChatRoomRepository
{
    Task<ChatRoom?> FindByIdAsync(int roomId);
    Task<IList<ChatRoom>> FindPublicRoomsAsync();
    Task<IList<ChatRoom>> FindRoomsByUserIdAsync(int userId);
    Task<ChatRoom> CreateAsync(ChatRoom room);
    Task<ChatRoom> UpdateAsync(ChatRoom room);
    Task<bool> DeleteAsync(int roomId);
    Task<IList<ChatRoom>> FindAllRoomsAdminAsync();
    Task<int> CountRoomsAsync();

    // Member operations
    Task<RoomMember?> FindMemberAsync(int roomId, int userId);
    Task<RoomMember?> FindMemberIncludingInactiveAsync(int roomId, int userId);
    Task<IList<RoomMember>> FindMembersByRoomIdAsync(int roomId);
    Task<bool> IsUserInRoomAsync(int roomId, int userId);
    Task<int> CountMembersAsync(int roomId);
    Task<RoomMember> AddMemberAsync(RoomMember member);
    Task<RoomMember> UpdateMemberAsync(RoomMember member);
    Task<bool> RemoveMemberAsync(int roomId, int userId);
}