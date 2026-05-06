using ConnectHub.Room.API.DTOs;

namespace ConnectHub.Room.API.Services;

public interface IChatRoomService
{
    Task<ChatRoomResponseDto> CreateRoomAsync(CreateRoomDto dto);
    Task<ChatRoomResponseDto?> GetRoomByIdAsync(int roomId);
    Task<IList<ChatRoomResponseDto>> GetPublicRoomsAsync();
    Task<IList<ChatRoomResponseDto>> GetRoomsByUserIdAsync(int userId);
    Task<ChatRoomResponseDto> UpdateRoomAsync(int roomId, UpdateRoomDto dto);
    Task<bool> DeleteRoomAsync(int roomId);

    Task<RoomMemberDto> AddMemberAsync(AddMemberDto dto, int actingUserId);
    Task<bool> RemoveMemberAsync(int roomId, int userId, int actingUserId);
    Task<bool> LeaveRoomAsync(int roomId, int userId);
    Task<RoomMemberDto> UpdateMemberRoleAsync(UpdateMemberRoleDto dto, int actingUserId);
    Task<IList<RoomMemberDto>> GetMembersAsync(int roomId);
    Task<bool> IsUserInRoomAsync(int roomId, int userId);

    // Throws UnauthorizedAccessException if actingUserId is not ADMIN of the room.
    Task EnsureAdminAsync(int roomId, int actingUserId);
}