using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ConnectHub.Message.API.DTOs;
using ConnectHub.Message.API.Services;
using ConnectHub.Shared.Models;

namespace ConnectHub.Message.API.Controllers;

[ApiController]
[Route("api/messages")]
[Authorize]
public class MessageController : ControllerBase
{
    private readonly IMessageService _service;

    public MessageController(IMessageService service)
    {
        _service = service;
    }

    // POST api/messages/send
    [HttpPost("send")]
    public async Task<IActionResult> Send([FromBody] SendMessageDto dto)
    {
        try
        {
            var result = await _service.SendMessageAsync(dto);
            return Ok(ApiResponse<MessageResponseDto>.Ok(result, "Message sent."));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ApiResponse<string>.Fail(ex.Message));
        }
    }

    // GET api/messages/direct?userId1=1&userId2=2&page=1&pageSize=20
    [HttpGet("direct")]
    public async Task<IActionResult> GetDirect(
        [FromQuery] int userId1,
        [FromQuery] int userId2,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        var result = await _service.GetDirectMessagesAsync(userId1, userId2, page, pageSize);
        return Ok(ApiResponse<PagedResult<MessageResponseDto>>.Ok(result));
    }

    // GET api/messages/room/{roomId}?page=1&pageSize=20
    [HttpGet("room/{roomId:int}")]
    public async Task<IActionResult> GetRoomMessages(
        int roomId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        var result = await _service.GetRoomMessagesAsync(roomId, page, pageSize);
        return Ok(ApiResponse<PagedResult<MessageResponseDto>>.Ok(result));
    }

    // GET api/messages/unread/{receiverId}
    [HttpGet("unread/{receiverId:int}")]
    public async Task<IActionResult> GetUnread(int receiverId)
    {
        var result = await _service.GetUnreadMessagesAsync(receiverId);
        return Ok(ApiResponse<IList<MessageResponseDto>>.Ok(result));
    }

    // GET api/messages/unread/{receiverId}/count
    [HttpGet("unread/{receiverId:int}/count")]
    public async Task<IActionResult> GetUnreadCount(int receiverId)
    {
        var count = await _service.GetUnreadCountAsync(receiverId);
        return Ok(ApiResponse<int>.Ok(count));
    }

    // PUT api/messages/{messageId}/edit
    [HttpPut("{messageId:int}/edit")]
    public async Task<IActionResult> Edit(int messageId, [FromBody] EditMessageDto dto)
    {
        try
        {
            var result = await _service.EditMessageAsync(messageId, dto);
            return Ok(ApiResponse<MessageResponseDto>.Ok(result, "Message edited."));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(ApiResponse<string>.Fail(ex.Message, 404));
        }
    }

    // PUT api/messages/mark-read?senderId=1&receiverId=2
    // Returns the count of rows actually flipped so the client can detect
    // no-op cases (already-all-read) and skip the corresponding SignalR
    // BroadcastMessagesRead — saves a needless fan-out when nothing changed.
    [HttpPut("mark-read")]
    public async Task<IActionResult> MarkRead(
        [FromQuery] int senderId,
        [FromQuery] int receiverId)
    {
        var count = await _service.MarkAllReadAsync(senderId, receiverId);
        return Ok(ApiResponse<int>.Ok(count, "Messages marked as read."));
    }

    // DELETE api/messages/{messageId}
    // "Delete for everyone" — soft-deletes server-side; both sender and receiver
    // see "This message was deleted." after the SignalR broadcast.
    [HttpDelete("{messageId:int}")]
    public async Task<IActionResult> Delete(int messageId)
    {
        var success = await _service.DeleteMessageAsync(messageId);
        if (!success)
            return NotFound(ApiResponse<string>.Fail("Message nahi mila.", 404));
        return Ok(ApiResponse<string>.Ok("Message deleted."));
    }

    // DELETE api/messages/{messageId}/for-me?userId=5
    // "Delete for me" — only hides the row for that one user. Other participants
    // continue to see it untouched. No SignalR broadcast.
    [HttpDelete("{messageId:int}/for-me")]
    public async Task<IActionResult> DeleteForMe(int messageId, [FromQuery] int userId)
    {
        var success = await _service.DeleteForMeAsync(messageId, userId);
        if (!success)
            return NotFound(ApiResponse<string>.Fail("Message nahi mila.", 404));
        return Ok(ApiResponse<string>.Ok("Hidden from your view."));
    }

    // PUT api/messages/{messageId}/delivered?recipientId=5
    // Recipient-only ack. Returns the updated row so the SignalR broadcast carries
    // the canonical DeliveredAt timestamp.
    [HttpPut("{messageId:int}/delivered")]
    public async Task<IActionResult> MarkDelivered(int messageId, [FromQuery] int recipientId)
    {
        var updated = await _service.MarkDeliveredAsync(messageId, recipientId);
        if (updated is null)
            return NotFound(ApiResponse<string>.Fail("Message nahi mila ya recipient mismatch.", 404));
        return Ok(ApiResponse<MessageResponseDto>.Ok(updated, "Marked delivered."));
    }

    // PUT api/messages/mark-all-delivered?recipientId=5
    // Bulk-ack on (re)connect: when a user comes online we flip every undelivered
    // direct message addressed to them. Returns the list of just-delivered
    // messages so the recipient's client can SignalR-broadcast each flip back
    // to the original sender — without the list, senders' ticks stay ✓ until
    // they hard-refresh.
    [HttpPut("mark-all-delivered")]
    public async Task<IActionResult> MarkAllDelivered([FromQuery] int recipientId)
    {
        var delivered = await _service.MarkAllDeliveredAsync(recipientId);
        return Ok(ApiResponse<IList<DeliveredMessageDto>>.Ok(delivered, "Bulk delivery acked."));
    }

    // GET api/messages/search?userId=1&keyword=hello
    [HttpGet("search")]
    public async Task<IActionResult> Search(
        [FromQuery] int userId,
        [FromQuery] string keyword)
    {
        var result = await _service.SearchMessagesAsync(userId, keyword);
        return Ok(ApiResponse<IList<MessageResponseDto>>.Ok(result));
    }

    // GET api/messages/search/room/{roomId}?keyword=hello
    [HttpGet("search/room/{roomId:int}")]
    public async Task<IActionResult> SearchRoom(int roomId, [FromQuery] string keyword)
    {
        var result = await _service.SearchRoomMessagesAsync(roomId, keyword);
        return Ok(ApiResponse<IList<MessageResponseDto>>.Ok(result));
    }

    // GET api/messages/recent/{userId}
    // One row per DM partner with last-message preview + unread count, ordered newest first.
    [HttpGet("recent/{userId:int}")]
    public async Task<IActionResult> Recent(int userId)
    {
        var result = await _service.GetRecentConversationsAsync(userId);
        return Ok(ApiResponse<IList<ConversationSummaryDto>>.Ok(result));
    }
}