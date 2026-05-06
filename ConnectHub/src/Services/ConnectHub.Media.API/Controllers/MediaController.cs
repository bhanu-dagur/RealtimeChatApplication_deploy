using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ConnectHub.Media.API.DTOs;
using ConnectHub.Media.API.Services;
using ConnectHub.Shared.Models;

namespace ConnectHub.Media.API.Controllers;

[ApiController]
[Route("api/media")]
[Authorize]
public class MediaController : ControllerBase
{
    private readonly IMediaService _service;

    public MediaController(IMediaService service)
    {
        _service = service;
    }

    // POST api/media/upload
    [HttpPost("upload")]
    [RequestSizeLimit(52_428_800)] // 50MB max
    public async Task<IActionResult> Upload(
        [FromForm] IFormFile file,
        [FromQuery] int uploadedBy,
        [FromQuery] int? messageId = null,
        [FromQuery] int? roomId = null,
        [FromQuery] bool isPermanent = false)
    {
        try
        {
            var result = await _service.UploadFileAsync(
                file, uploadedBy, messageId, roomId, isPermanent);

            return Ok(ApiResponse<UploadResponseDto>.Ok(
                result, "File upload ho gayi."));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ApiResponse<string>.Fail(ex.Message));
        }
        catch (Exception ex)
        {
            return StatusCode(500,
                ApiResponse<string>.Fail($"Upload failed: {ex.Message}", 500));
        }
    }

    // GET api/media/{fileId}
    [HttpGet("{fileId:guid}")]
    public async Task<IActionResult> GetById(Guid fileId)
    {
        var file = await _service.GetFileByIdAsync(fileId);
        if (file is null)
            return NotFound(ApiResponse<string>.Fail("File nahi mili.", 404));

        return Ok(ApiResponse<MediaFileResponseDto>.Ok(file));
    }

    // GET api/media/user/{userId}
    [HttpGet("user/{userId:int}")]
    public async Task<IActionResult> GetByUser(int userId)
    {
        var files = await _service.GetFilesByUserAsync(userId);
        return Ok(ApiResponse<IList<MediaFileResponseDto>>.Ok(files));
    }

    // GET api/media/room/{roomId}
    [HttpGet("room/{roomId:int}")]
    public async Task<IActionResult> GetByRoom(int roomId)
    {
        var files = await _service.GetFilesByRoomAsync(roomId);
        return Ok(ApiResponse<IList<MediaFileResponseDto>>.Ok(files));
    }

    // DELETE api/media/{fileId}
    [HttpDelete("{fileId:guid}")]
    public async Task<IActionResult> Delete(Guid fileId)
    {
        var success = await _service.DeleteFileAsync(fileId);
        if (!success)
            return NotFound(ApiResponse<string>.Fail("File nahi mili.", 404));

        return Ok(ApiResponse<string>.Ok(
            "File Cloudinary aur database dono se delete ho gayi."));
    }

    // GET api/media/stats
    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        var stats = await _service.GetStatsAsync();
        return Ok(ApiResponse<MediaStatsDto>.Ok(stats));
    }
}