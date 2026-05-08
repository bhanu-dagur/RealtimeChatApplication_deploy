using ConnectHub.Room.API.DTOs;
using ConnectHub.Room.API.Models;
using ConnectHub.Room.API.Repositories;
using ConnectHub.Shared.Enums;

namespace ConnectHub.Room.API.Services;

public class ChatRoomService : IChatRoomService
{
    private readonly IChatRoomRepository _repo;
    private readonly INotificationClient _notifications;

    public ChatRoomService(IChatRoomRepository repo, INotificationClient notifications)
    {
        _repo = repo;
        _notifications = notifications;
    }

    public async Task<ChatRoomResponseDto> CreateRoomAsync(CreateRoomDto dto)
    {
        var room = new ChatRoom
        {
            RoomName = dto.RoomName,
            Description = dto.Description,
            RoomType = dto.RoomType,
            AvatarUrl = dto.AvatarUrl,
            CreatedBy = dto.CreatedBy
        };

        var created = await _repo.CreateAsync(room);

        // Creator is always ADMIN.
        await _repo.AddMemberAsync(new RoomMember
        {
            RoomId = created.RoomId,
            UserId = dto.CreatedBy,
            Role = MemberRole.ADMIN
        });

        // Bulk-add the initial members (de-duped, creator excluded).
        if (dto.InitialMemberIds is { Count: > 0 })
        {
            var seen = new HashSet<int> { dto.CreatedBy };
            foreach (var memberId in dto.InitialMemberIds)
            {
                if (!seen.Add(memberId)) continue;        // skip dupes / creator
                if (memberId <= 0) continue;
                await _repo.AddMemberAsync(new RoomMember
                {
                    RoomId = created.RoomId,
                    UserId = memberId,
                    Role = MemberRole.MEMBER
                });

                await NotifyAddedToRoomAsync(memberId, dto.CreatedBy, created);
            }
        }

        var memberCount = await _repo.CountMembersAsync(created.RoomId);
        return MapToDto(created, memberCount);
    }

    // Best-effort group-add notification. Failures are swallowed inside the
    // client so a flaky Notification.API never breaks the add-member flow.
    private Task NotifyAddedToRoomAsync(int recipientId, int actorId, ChatRoom room) =>
        _notifications.SendAsync(
            recipientId: recipientId,
            senderId: actorId,
            type: NotificationType.ROOM_INVITE,
            title: $"Added to {room.RoomName}",
            message: $"You were added to the group \"{room.RoomName}\".",
            relatedId: room.RoomId);

    public async Task<ChatRoomResponseDto?> GetRoomByIdAsync(int roomId)
    {
        var room = await _repo.FindByIdAsync(roomId);
        if (room is null) return null;
        var count = await _repo.CountMembersAsync(roomId);
        return MapToDto(room, count);
    }

    public async Task<IList<ChatRoomResponseDto>> GetPublicRoomsAsync()
    {
        var rooms = await _repo.FindPublicRoomsAsync();
        var result = new List<ChatRoomResponseDto>();
        foreach (var room in rooms)
        {
            var count = await _repo.CountMembersAsync(room.RoomId);
            result.Add(MapToDto(room, count));
        }
        return result;
    }

    public async Task<IList<ChatRoomResponseDto>> GetRoomsByUserIdAsync(int userId)
    {
        var rooms = await _repo.FindRoomsByUserIdAsync(userId);
        var result = new List<ChatRoomResponseDto>();
        foreach (var room in rooms)
        {
            var count = await _repo.CountMembersAsync(room.RoomId);
            result.Add(MapToDto(room, count));
        }
        return result;
    }

    public async Task<ChatRoomResponseDto> UpdateRoomAsync(int roomId, UpdateRoomDto dto)
    {
        var room = await _repo.FindByIdAsync(roomId)
            ?? throw new KeyNotFoundException("Room nahi mili.");

        if (dto.RoomName is not null) room.RoomName = dto.RoomName;
        if (dto.Description is not null) room.Description = dto.Description;
        if (dto.AvatarUrl is not null) room.AvatarUrl = dto.AvatarUrl;

        var updated = await _repo.UpdateAsync(room);
        var count = await _repo.CountMembersAsync(roomId);
        return MapToDto(updated, count);
    }

    public async Task<bool> DeleteRoomAsync(int roomId) =>
        await _repo.DeleteAsync(roomId);

    public async Task EnsureAdminAsync(int roomId, int actingUserId)
    {
        var actor = await _repo.FindMemberAsync(roomId, actingUserId)
            ?? throw new UnauthorizedAccessException("You are not a member of this room.");
        if (actor.Role != MemberRole.ADMIN)
            throw new UnauthorizedAccessException("Only room admins can perform this action.");
    }

    public async Task<RoomMemberDto> AddMemberAsync(AddMemberDto dto, int actingUserId)
    {
        // Self-join into a PUBLIC room is allowed; otherwise the acting user must be ADMIN.
        if (dto.UserId != actingUserId)
            await EnsureAdminAsync(dto.RoomId, actingUserId);
        else
        {
            var room = await _repo.FindByIdAsync(dto.RoomId)
                ?? throw new KeyNotFoundException("Room nahi mili.");
            if (room.RoomType != Shared.Enums.RoomType.PUBLIC)
                await EnsureAdminAsync(dto.RoomId, actingUserId);
        }

        var result = await AddMemberCoreAsync(dto);

        // Only notify when an admin added someone else. Self-joins to a public
        // room are deliberate — no need to ping the user about their own action.
        if (dto.UserId != actingUserId)
        {
            var room = await _repo.FindByIdAsync(dto.RoomId);
            if (room is not null)
                await NotifyAddedToRoomAsync(dto.UserId, actingUserId, room);
        }

        return result;
    }

    private async Task<RoomMemberDto> AddMemberCoreAsync(AddMemberDto dto)
    {
        var room = await _repo.FindByIdAsync(dto.RoomId)
            ?? throw new KeyNotFoundException("Room nahi mili.");

        var currentCount = await _repo.CountMembersAsync(dto.RoomId);
        if (currentCount >= room.MaxMembers)
            throw new InvalidOperationException(
                $"Room full hai. Max {room.MaxMembers} members allowed hain.");

        // Reactivate if a soft-deleted membership row already exists.
        // Without this the unique (RoomId, UserId) index throws on rejoin
        // because the index is not filtered on IsActive.
        var existing = await _repo.FindMemberIncludingInactiveAsync(dto.RoomId, dto.UserId);
        if (existing is not null)
        {
            if (existing.IsActive)
                throw new InvalidOperationException("User pehle se is room mein hai.");

            existing.IsActive = true;
            existing.JoinedAt = DateTime.UtcNow;
            existing.Role = MemberRole.MEMBER;
            var reactivated = await _repo.UpdateMemberAsync(existing);
            return MapMemberToDto(reactivated);
        }

        var member = new RoomMember
        {
            RoomId = dto.RoomId,
            UserId = dto.UserId,
            Role = MemberRole.MEMBER
        };

        var added = await _repo.AddMemberAsync(member);
        return MapMemberToDto(added);
    }

    public async Task<bool> RemoveMemberAsync(int roomId, int userId, int actingUserId)
    {
        // Admins can remove anyone (including other admins); a member can only remove themselves
        // (which is `LeaveRoomAsync`'s job — keep them separate to make audit logs clearer).
        if (userId != actingUserId)
            await EnsureAdminAsync(roomId, actingUserId);
        return await _repo.RemoveMemberAsync(roomId, userId);
    }

    public async Task<bool> LeaveRoomAsync(int roomId, int userId) =>
        await _repo.RemoveMemberAsync(roomId, userId);

    public async Task<RoomMemberDto> UpdateMemberRoleAsync(UpdateMemberRoleDto dto, int actingUserId)
    {
        await EnsureAdminAsync(dto.RoomId, actingUserId);

        var member = await _repo.FindMemberAsync(dto.RoomId, dto.UserId)
            ?? throw new KeyNotFoundException("Member nahi mila.");

        // Don't let the last admin demote themselves — would orphan the room.
        if (member.Role == MemberRole.ADMIN && dto.NewRole != MemberRole.ADMIN)
        {
            var allMembers = await _repo.FindMembersByRoomIdAsync(dto.RoomId);
            var otherAdmins = allMembers.Count(m => m.Role == MemberRole.ADMIN && m.UserId != dto.UserId);
            if (otherAdmins == 0)
                throw new InvalidOperationException("Cannot demote the last admin. Promote someone else first.");
        }

        member.Role = dto.NewRole;
        var updated = await _repo.UpdateMemberAsync(member);

        if (dto.NewRole == MemberRole.ADMIN)
        {
            var room = await _repo.FindByIdAsync(dto.RoomId);
            if (room != null)
            {
                await _notifications.SendAsync(
                    recipientId: dto.UserId,
                    senderId: actingUserId,
                    type: NotificationType.ROLE_CHANGE,
                    title: "Role Updated",
                    message: $"You are now an admin in \"{room.RoomName}\".",
                    relatedId: room.RoomId);
            }
        }

        return MapMemberToDto(updated);
    }

    public async Task<IList<RoomMemberDto>> GetMembersAsync(int roomId)
    {
        var members = await _repo.FindMembersByRoomIdAsync(roomId);
        return members.Select(MapMemberToDto).ToList();
    }

    public async Task<bool> IsUserInRoomAsync(int roomId, int userId) =>
        await _repo.IsUserInRoomAsync(roomId, userId);

    public async Task<IList<ChatRoomResponseDto>> GetAllRoomsAdminAsync()
    {
        var rooms = await _repo.FindAllRoomsAdminAsync();
        var result = new List<ChatRoomResponseDto>();
        foreach (var room in rooms)
        {
            var count = await _repo.CountMembersAsync(room.RoomId);
            result.Add(MapToDto(room, count));
        }
        return result;
    }

    public async Task<int> CountRoomsAsync() =>
        await _repo.CountRoomsAsync();

    // ── Private helpers ───────────────────────────────────────────

    private static ChatRoomResponseDto MapToDto(ChatRoom r, int memberCount) => new()
    {
        RoomId = r.RoomId,
        RoomName = r.RoomName,
        Description = r.Description,
        RoomType = r.RoomType,
        AvatarUrl = r.AvatarUrl,
        CreatedBy = r.CreatedBy,
        CreatedAt = r.CreatedAt,
        MaxMembers = r.MaxMembers,
        MemberCount = memberCount
    };

    private static RoomMemberDto MapMemberToDto(RoomMember m) => new()
    {
        MemberId = m.MemberId,
        RoomId = m.RoomId,
        UserId = m.UserId,
        Role = m.Role,
        JoinedAt = m.JoinedAt
    };
}