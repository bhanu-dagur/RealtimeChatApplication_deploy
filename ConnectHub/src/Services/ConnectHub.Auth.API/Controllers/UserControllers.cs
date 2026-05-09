using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ConnectHub.Auth.API.DTOs;
using ConnectHub.Auth.API.Services;
using ConnectHub.Shared.Models;

namespace ConnectHub.Auth.API.Controllers;

[ApiController]
[Route("api/users")]
public class UserController : ControllerBase
{
    private readonly IUserService _service;

    public UserController(IUserService service)
    {
        _service = service;
    }

    // POST api/users/register
    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterDto dto)
    {
        try
        {
            var result = await _service.RegisterAsync(dto);
            return Ok(ApiResponse<AuthResponseDto>.Ok(result, "Registration successful."));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ApiResponse<string>.Fail(ex.Message));
        }
    }

    // POST api/users/login
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginDto dto)
    {
        try
        {
            var result = await _service.LoginAsync(dto);
            return Ok(ApiResponse<AuthResponseDto>.Ok(result, "Login successful."));
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(ApiResponse<string>.Fail(ex.Message, 401));
        }
    }

    // POST api/users/google-login
    [HttpPost("google-login")]
    public async Task<IActionResult> GoogleLogin([FromBody] GoogleLoginDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.IdToken))
            return BadRequest(ApiResponse<string>.Fail("Missing Google ID token."));

        try
        {
            var result = await _service.LoginWithGoogleAsync(dto.IdToken);
            return Ok(ApiResponse<AuthResponseDto>.Ok(result, "Google login successful."));
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(ApiResponse<string>.Fail(ex.Message, 401));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ApiResponse<string>.Fail(ex.Message));
        }
    }

    // GET api/users/{id}
    [HttpGet("{id:int}")]
    [Authorize]
    public async Task<IActionResult> GetById(int id)
    {
        var user = await _service.GetUserByIdAsync(id);
        if (user is null)
            return NotFound(ApiResponse<string>.Fail("User not found.", 404));
        return Ok(ApiResponse<UserProfileDto>.Ok(user));
    }

    // GET api/users/search?q=ali
    [HttpGet("search")]
    [Authorize]
    public async Task<IActionResult> Search([FromQuery] string q)
    {
        var results = await _service.SearchUsersAsync(q);
        return Ok(ApiResponse<IList<UserProfileDto>>.Ok(results));
    }

    // GET api/users/active
    [HttpGet("active")]
    [Authorize]
    public async Task<IActionResult> GetActive()
    {
        var users = await _service.GetAllActiveUsersAsync();
        return Ok(ApiResponse<IList<UserProfileDto>>.Ok(users));
    }

    // PUT api/users/{id}/profile
    [HttpPut("{id:int}/profile")]
    [Authorize]
    public async Task<IActionResult> UpdateProfile(int id, [FromBody] UpdateProfileDto dto)
    {
        try
        {
            var updated = await _service.UpdateProfileAsync(id, dto);
            return Ok(ApiResponse<UserProfileDto>.Ok(updated, "Profile updated."));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(ApiResponse<string>.Fail(ex.Message, 404));
        }
    }

    // PUT api/users/{id}/change-password
    [HttpPut("{id:int}/change-password")]
    [Authorize]
    public async Task<IActionResult> ChangePassword(int id,
        [FromBody] ChangePasswordDto dto)
    {
        var success = await _service.ChangePasswordAsync(id, dto.OldPassword, dto.NewPassword);
        if (!success)
            return BadRequest(ApiResponse<string>.Fail("Old password is incorrect."));
        return Ok(ApiResponse<string>.Ok("Password changed."));
    }

    // DELETE api/users/{id}/deactivate
    [HttpDelete("{id:int}/deactivate")]
    [Authorize]
    public async Task<IActionResult> Deactivate(int id)
    {
        var success = await _service.DeactivateAccountAsync(id);
        if (!success)
            return NotFound(ApiResponse<string>.Fail("User not found.", 404));
        return Ok(ApiResponse<string>.Ok("Account deactivated."));
    }

    // PUT api/users/{id}/online-status
    // Called by the Hub.API service-to-service. Explicitly anonymous so the hub
    // doesn't have to forge a user JWT just to flip an online flag.
    [HttpPut("{id:int}/online-status")]
    [AllowAnonymous]
    public async Task<IActionResult> UpdateOnlineStatus(int id, [FromBody] UpdateOnlineStatusDto dto)
    {
        await _service.SetOnlineStatusAsync(id, dto.IsOnline);
        return Ok(ApiResponse<string>.Ok("Online status updated."));
    }

    // GET api/users/by-username/{username}
    [HttpGet("by-username/{username}")]
    [Authorize]
    public async Task<IActionResult> GetByUserName(string username)
    {
        var user = await _service.GetUserByUserNameAsync(username);
        if (user is null)
            return NotFound(ApiResponse<string>.Fail("User not found.", 404));
        return Ok(ApiResponse<UserProfileDto>.Ok(user));
    }
}