using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ConnectHub.Room.API.Services;
using ConnectHub.Shared.Models;
using ConnectHub.Room.API.DTOs;

namespace ConnectHub.Room.API.Controllers;

[ApiController]
[Route("api/rooms/admin")]
[Authorize(Roles = "Admin")]
public class AdminRoomController : ControllerBase
{
    private readonly IChatRoomService _service;

    public AdminRoomController(IChatRoomService service)
    {
        _service = service;
    }

    [HttpGet("rooms")]
    public async Task<IActionResult> GetAllRooms()
    {
        var rooms = await _service.GetAllRoomsAdminAsync();
        return Ok(ApiResponse<IList<ChatRoomResponseDto>>.Ok(rooms));
    }

    [HttpDelete("rooms/{roomId}")]
    public async Task<IActionResult> DeleteRoom(int roomId)
    {
        var success = await _service.DeleteRoomAsync(roomId);
        if (!success)
            return NotFound(ApiResponse<string>.Fail("Room not found.", 404));

        return Ok(ApiResponse<string>.Ok("Room successfully deleted."));
    }

    [HttpGet("analytics/rooms")]
    public async Task<IActionResult> GetRoomCount()
    {
        var count = await _service.CountRoomsAsync();
        return Ok(ApiResponse<int>.Ok(count));
    }
}
