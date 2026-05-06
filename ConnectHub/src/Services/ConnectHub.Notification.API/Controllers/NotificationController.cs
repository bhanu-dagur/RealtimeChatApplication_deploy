using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ConnectHub.Notification.API.DTOs;
using ConnectHub.Notification.API.Services;
using ConnectHub.Shared.Models;

namespace ConnectHub.Notification.API.Controllers;

[ApiController]
[Route("api/notifications")]
[Authorize]
public class NotificationController : ControllerBase
{
    private readonly INotificationService _service;

    public NotificationController(INotificationService service)
    {
        _service = service;
    }

    // POST api/notifications/send
    [HttpPost("send")]
    public async Task<IActionResult> Send([FromBody] SendNotificationDto dto)
    {
        var result = await _service.SendAsync(dto);
        return Ok(ApiResponse<NotificationResponseDto>.Ok(
            result, "Notification bheji gayi."));
    }

    // POST api/notifications/broadcast
    [HttpPost("broadcast")]
    public async Task<IActionResult> Broadcast([FromBody] BroadcastNotificationDto dto)
    {
        var result = await _service.SendBulkAsync(dto);
        return Ok(ApiResponse<IList<NotificationResponseDto>>.Ok(
            result, "Broadcast bheja gaya."));
    }

    // GET api/notifications/recipient/{recipientId}
    [HttpGet("recipient/{recipientId:int}")]
    public async Task<IActionResult> GetByRecipient(int recipientId)
    {
        var result = await _service.GetByRecipientAsync(recipientId);
        return Ok(ApiResponse<IList<NotificationResponseDto>>.Ok(result));
    }

    // GET api/notifications/unread/{recipientId}
    [HttpGet("unread/{recipientId:int}")]
    public async Task<IActionResult> GetUnread(int recipientId)
    {
        var result = await _service.GetUnreadAsync(recipientId);
        return Ok(ApiResponse<IList<NotificationResponseDto>>.Ok(result));
    }

    // GET api/notifications/unread/{recipientId}/count
    [HttpGet("unread/{recipientId:int}/count")]
    public async Task<IActionResult> GetUnreadCount(int recipientId)
    {
        var count = await _service.GetUnreadCountAsync(recipientId);
        return Ok(ApiResponse<int>.Ok(count));
    }

    // PUT api/notifications/{notificationId}/read
    [HttpPut("{notificationId:int}/read")]
    public async Task<IActionResult> MarkAsRead(int notificationId)
    {
        try
        {
            var result = await _service.MarkAsReadAsync(notificationId);
            return Ok(ApiResponse<NotificationResponseDto>.Ok(
                result, "Notification read mark ho gayi."));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(ApiResponse<string>.Fail(ex.Message, 404));
        }
    }

    // PUT api/notifications/read-all/{recipientId}
    [HttpPut("read-all/{recipientId:int}")]
    public async Task<IActionResult> MarkAllRead(int recipientId)
    {
        await _service.MarkAllReadAsync(recipientId);
        return Ok(ApiResponse<string>.Ok("Saari notifications read mark ho gayin."));
    }

    // DELETE api/notifications/{notificationId}
    [HttpDelete("{notificationId:int}")]
    public async Task<IActionResult> Delete(int notificationId)
    {
        var success = await _service.DeleteAsync(notificationId);
        if (!success)
            return NotFound(ApiResponse<string>.Fail("Notification nahi mili.", 404));
        return Ok(ApiResponse<string>.Ok("Notification delete ho gayi."));
    }

    // GET api/notifications/all?page=1&pageSize=20
    [HttpGet("all")]
    public async Task<IActionResult> GetAll(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        var result = await _service.GetAllAsync(page, pageSize);
        return Ok(ApiResponse<PagedResult<NotificationResponseDto>>.Ok(result));
    }
}