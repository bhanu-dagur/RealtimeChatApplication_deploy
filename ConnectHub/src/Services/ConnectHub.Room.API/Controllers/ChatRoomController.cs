using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ConnectHub.Room.API.DTOs;
using ConnectHub.Room.API.Services;
using ConnectHub.Shared.Models;

namespace ConnectHub.Room.API.Controllers;

[ApiController]
[Route("api/rooms")]
[Authorize]
public class ChatRoomController : ControllerBase
{
    private readonly IChatRoomService _service;

    public ChatRoomController(IChatRoomService service)
    {
        _service = service;
    }

    private int CurrentUserId()
    {
        var raw = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return int.TryParse(raw, out var id) ? id : 0;
    }

    // POST api/rooms/create
    [HttpPost("create")]
    public async Task<IActionResult> Create([FromBody] CreateRoomDto dto)
    {
        try
        {
            var result = await _service.CreateRoomAsync(dto);
            return Ok(ApiResponse<ChatRoomResponseDto>.Ok(result, "Room bana di gayi."));
        }
        catch (Exception ex)
        {
            return BadRequest(ApiResponse<string>.Fail(ex.Message));
        }
    }

    // GET api/rooms/{roomId}
    [HttpGet("{roomId:int}")]
    public async Task<IActionResult> GetById(int roomId)
    {
        var room = await _service.GetRoomByIdAsync(roomId);
        if (room is null)
            return NotFound(ApiResponse<string>.Fail("Room nahi mili.", 404));
        return Ok(ApiResponse<ChatRoomResponseDto>.Ok(room));
    }

    // GET api/rooms/public
    [HttpGet("public")]
    public async Task<IActionResult> GetPublic()
    {
        var rooms = await _service.GetPublicRoomsAsync();
        return Ok(ApiResponse<IList<ChatRoomResponseDto>>.Ok(rooms));
    }

    // GET api/rooms/user/{userId}
    [HttpGet("user/{userId:int}")]
    public async Task<IActionResult> GetByUser(int userId)
    {
        var rooms = await _service.GetRoomsByUserIdAsync(userId);
        return Ok(ApiResponse<IList<ChatRoomResponseDto>>.Ok(rooms));
    }

    // PUT api/rooms/{roomId}
    [HttpPut("{roomId:int}")]
    public async Task<IActionResult> Update(int roomId, [FromBody] UpdateRoomDto dto)
    {
        try
        {
            var updated = await _service.UpdateRoomAsync(roomId, dto);
            return Ok(ApiResponse<ChatRoomResponseDto>.Ok(updated, "Room update ho gayi."));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(ApiResponse<string>.Fail(ex.Message, 404));
        }
    }

    // DELETE api/rooms/{roomId}
    [HttpDelete("{roomId:int}")]
    public async Task<IActionResult> Delete(int roomId)
    {
        var success = await _service.DeleteRoomAsync(roomId);
        if (!success)
            return NotFound(ApiResponse<string>.Fail("Room nahi mili.", 404));
        return Ok(ApiResponse<string>.Ok("Room delete ho gayi."));
    }

    // ── Member Endpoints ──────────────────────────────────────────

    // POST api/rooms/members/add
    [HttpPost("members/add")]
    public async Task<IActionResult> AddMember([FromBody] AddMemberDto dto)
    {
        try
        {
            var member = await _service.AddMemberAsync(dto, CurrentUserId());
            return Ok(ApiResponse<RoomMemberDto>.Ok(member, "Member add ho gaya."));
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, ApiResponse<string>.Fail(ex.Message, 403));
        }
        catch (Exception ex)
        {
            return BadRequest(ApiResponse<string>.Fail(ex.Message));
        }
    }

    // GET api/rooms/{roomId}/members
    [HttpGet("{roomId:int}/members")]
    public async Task<IActionResult> GetMembers(int roomId)
    {
        var members = await _service.GetMembersAsync(roomId);
        return Ok(ApiResponse<IList<RoomMemberDto>>.Ok(members));
    }

    // PUT api/rooms/members/role
    [HttpPut("members/role")]
    public async Task<IActionResult> UpdateRole([FromBody] UpdateMemberRoleDto dto)
    {
        try
        {
            var updated = await _service.UpdateMemberRoleAsync(dto, CurrentUserId());
            return Ok(ApiResponse<RoomMemberDto>.Ok(updated, "Role update ho gayi."));
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, ApiResponse<string>.Fail(ex.Message, 403));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ApiResponse<string>.Fail(ex.Message));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(ApiResponse<string>.Fail(ex.Message, 404));
        }
    }

    // DELETE api/rooms/{roomId}/members/{userId}/remove
    [HttpDelete("{roomId:int}/members/{userId:int}/remove")]
    public async Task<IActionResult> RemoveMember(int roomId, int userId)
    {
        try
        {
            var success = await _service.RemoveMemberAsync(roomId, userId, CurrentUserId());
            if (!success)
                return NotFound(ApiResponse<string>.Fail("Member nahi mila.", 404));
            return Ok(ApiResponse<string>.Ok("Member remove ho gaya."));
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, ApiResponse<string>.Fail(ex.Message, 403));
        }
    }

    // DELETE api/rooms/{roomId}/leave/{userId}
    [HttpDelete("{roomId:int}/leave/{userId:int}")]
    public async Task<IActionResult> Leave(int roomId, int userId)
    {
        var success = await _service.LeaveRoomAsync(roomId, userId);
        if (!success)
            return NotFound(ApiResponse<string>.Fail("Member nahi mila.", 404));
        return Ok(ApiResponse<string>.Ok("Room leave kar di."));
    }

    // GET api/rooms/{roomId}/ismember/{userId}
    [HttpGet("{roomId:int}/ismember/{userId:int}")]
    public async Task<IActionResult> IsMember(int roomId, int userId)
    {
        var result = await _service.IsUserInRoomAsync(roomId, userId);
        return Ok(ApiResponse<bool>.Ok(result));
    }
}