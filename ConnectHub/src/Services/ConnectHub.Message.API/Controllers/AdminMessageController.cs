using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ConnectHub.Message.API.Services;
using ConnectHub.Shared.Models;
using ConnectHub.Message.API.DTOs;

namespace ConnectHub.Message.API.Controllers;

[ApiController]
[Route("api/messages/admin")]
[Authorize(Roles = "Admin")]
public class AdminMessageController : ControllerBase
{
    private readonly IMessageService _service;

    public AdminMessageController(IMessageService service)
    {
        _service = service;
    }

    [HttpGet("messages")]
    public async Task<IActionResult> GetAllMessages(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        var result = await _service.GetAllMessagesAdminAsync(page, pageSize);
        return Ok(ApiResponse<PagedResult<MessageResponseDto>>.Ok(result));
    }

    [HttpDelete("messages/{messageId}")]
    public async Task<IActionResult> DeleteMessage(int messageId)
    {
        var success = await _service.DeleteMessageAdminAsync(messageId);
        if (!success)
            return NotFound(ApiResponse<string>.Fail("Message not found.", 404));

        return Ok(ApiResponse<string>.Ok("Message successfully permanently deleted."));
    }

    [HttpGet("analytics/messages")]
    public async Task<IActionResult> GetMessageCount()
    {
        var count = await _service.CountMessagesAsync();
        return Ok(ApiResponse<int>.Ok(count));
    }
}
