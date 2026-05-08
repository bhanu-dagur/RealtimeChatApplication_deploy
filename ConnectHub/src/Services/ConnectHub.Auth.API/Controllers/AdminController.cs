using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ConnectHub.Auth.API.Services;
using ConnectHub.Shared.Models;
using ConnectHub.Auth.API.DTOs;

namespace ConnectHub.Auth.API.Controllers;

[ApiController]
[Route("api/users/admin")]
[Authorize(Roles = "Admin")]
public class AdminController : ControllerBase
{
    private readonly IUserService _service;

    public AdminController(IUserService service)
    {
        _service = service;
    }

    [HttpGet("users")]
    public async Task<IActionResult> GetAllUsers()
    {
        var users = await _service.GetAllUsersAdminAsync();
        return Ok(ApiResponse<IList<UserProfileDto>>.Ok(users));
    }

    [HttpPut("users/{userId}/suspend")]
    public async Task<IActionResult> SuspendUser(int userId)
    {
        var success = await _service.SuspendUserAsync(userId);
        if (!success)
            return NotFound(ApiResponse<string>.Fail("User not found.", 404));

        return Ok(ApiResponse<string>.Ok("User account suspended."));
    }

    [HttpDelete("users/{userId}")]
    public async Task<IActionResult> DeleteUser(int userId)
    {
        var success = await _service.DeleteUserAsync(userId);
        if (!success)
            return NotFound(ApiResponse<string>.Fail("User not found.", 404));

        return Ok(ApiResponse<string>.Ok("User account permanently deleted."));
    }

    [HttpGet("analytics/users")]
    public async Task<IActionResult> GetUserCount()
    {
        var count = await _service.CountUsersAsync();
        return Ok(ApiResponse<int>.Ok(count));
    }
}
