import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';
import { ChatTimePipe, formatChatTime } from '../../../shared/pipes/chat-time.pipe';
import { Message, MessageType } from '../../../shared/models/message.model';

export type MessageActionKind = 'edit' | 'delete' | 'delete-for-me' | 'reply' | 'jump-to-reply';

export interface MessageAction {
  kind: MessageActionKind;
  message: Message;
  newContent?: string;
}

// Drives the tick rendering on the sender side. Mapped from the saved Message:
//   pending=true (no row id yet)            → 'pending'  (clock icon)
//   server-saved, no delivery ack           → 'sent'     (single grey ✓)
//   delivery ack but not yet read           → 'delivered'(double grey ✓✓)
//   recipient marked as read                → 'read'     (double blue ✓✓)
export type DeliveryState = 'pending' | 'sent' | 'delivered' | 'read';

@Component({
  selector: 'app-message-bubble',
  standalone: true,
  imports: [CommonModule, FormsModule, AvatarComponent, ChatTimePipe],
  templateUrl: './message-bubble.component.html',
  styleUrls: ['./message-bubble.component.scss']
})
export class MessageBubbleComponent {
  @Input() message!: Message;
  @Input() isMine = false;
  @Input() senderName = '';
  @Input() senderAvatarUrl = '';
  @Input() showAvatar = true;
  @Input() replyPreview?: { senderName: string; content: string };
  @Input() searchHighlight?: string;
  @Output() action = new EventEmitter<MessageAction>();

  menuOpen = signal(false);
  editing = signal(false);
  draft = signal('');

  // Long-press support (mobile). 500ms is the WhatsApp threshold; shorter feels
  // accidental, longer feels broken. Cancelled on touchmove/touchend.
  private pressTimer?: ReturnType<typeof setTimeout>;

  toggleMenu(): void {
    // Open if EITHER edit/delete-for-everyone (own message) OR delete-for-me
    // (any non-deleted row) is available — receivers still get the "for me" option.
    if (!this.canModify() && !this.canDeleteForMe()) return;
    this.menuOpen.update(v => !v);
  }

  closeMenu(): void { this.menuOpen.set(false); }

  // Right-click handler. Suppress the browser's native context menu and open
  // ours — matches WhatsApp Web's desktop behaviour exactly.
  onContextMenu(event: MouseEvent): void {
    if (!this.canModify() && !this.canDeleteForMe()) return;
    event.preventDefault();
    this.menuOpen.set(true);
  }

  onTouchStart(): void {
    if (!this.canModify() && !this.canDeleteForMe()) return;
    clearTimeout(this.pressTimer);
    this.pressTimer = setTimeout(() => this.menuOpen.set(true), 500);
  }

  cancelPress(): void { clearTimeout(this.pressTimer); }

  startEdit(): void {
    this.draft.set(this.message.content);
    this.editing.set(true);
    this.menuOpen.set(false);
  }

  cancelEdit(): void { this.editing.set(false); }

  // Enter saves; Shift+Enter inserts a newline (WhatsApp / Slack convention).
  // The previous (keydown.enter) shorthand fired regardless of the shift key,
  // so multi-line edits were impossible.
  onEditKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.saveEdit();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelEdit();
    }
  }

  saveEdit(): void {
    const next = this.draft().trim();
    this.editing.set(false);
    if (!next || next === this.message.content) return;
    this.action.emit({ kind: 'edit', message: this.message, newContent: next });
  }

  // "Delete for everyone" — only allowed on my own messages.
  confirmDelete(): void {
    this.menuOpen.set(false);
    if (!confirm('Delete for everyone? Both participants will see "This message was deleted."'))
      return;
    this.action.emit({ kind: 'delete', message: this.message });
  }

  // "Delete for me" — works on any message in the conversation, including ones
  // sent by the other person. Hides the row only for the current user.
  confirmDeleteForMe(): void {
    this.menuOpen.set(false);
    if (!confirm('Hide this message from your view? It will remain visible to others.'))
      return;
    this.action.emit({ kind: 'delete-for-me', message: this.message });
  }

  reply(): void {
    this.menuOpen.set(false);
    this.action.emit({ kind: 'reply', message: this.message });
  }

  // Click on the quoted reply preview → ask the parent to scroll to the
  // original message. Parent already has a `jumpToMessage(id)` helper in
  // both direct-chat and room-chat; this just routes the request through
  // the same MessageAction event channel.
  onReplyPreviewClick(): void {
    this.action.emit({ kind: 'jump-to-reply', message: this.message });
  }

  // Edit + Delete-for-everyone require ownership AND a non-deleted row.
  canModify(): boolean {
    return this.isMine && !this.message.isDeleted;
  }

  // Delete-for-me works on anything that's still showing in your list.
  canDeleteForMe(): boolean {
    return !this.message.isDeleted;
  }

  /**
   * Compute which tick state to render. Sender-only (we never tick on the
   * receiver's bubble). Order matters: read takes precedence over delivered,
   * delivered over sent.
   */
  deliveryState(): DeliveryState {
    if (this.message.pending) return 'pending';
    if (this.message.isRead) return 'read';
    if (this.message.isDelivered) return 'delivered';
    return 'sent';
  }

  // Expose the MessageType enum to the template so we can switch on integer
  // values instead of stringly-typed comparisons.
  readonly MessageType = MessageType;

  // True only for IMAGE messages with a usable URL — drives the <img> branch.
  // FILE / AUDIO need their own renderers; treating every mediaUrl as an image
  // produced broken-image icons for those types.
  isImage(): boolean {
    return this.message.messageType === MessageType.IMAGE && !!this.message.mediaUrl;
  }

  isAudio(): boolean {
    return this.message.messageType === MessageType.AUDIO && !!this.message.mediaUrl;
  }

  isFile(): boolean {
    return this.message.messageType === MessageType.FILE && !!this.message.mediaUrl;
  }

  // For search highlighting — splits content into pieces around matches.
  highlightedParts(): { text: string; match: boolean }[] {
    const text = this.message.content ?? '';
    const q = (this.searchHighlight ?? '').trim();
    if (!q) return [{ text, match: false }];
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');
    return text.split(re).filter(Boolean).map(piece => ({
      text: piece,
      match: piece.toLowerCase() === q.toLowerCase()
    }));
  }

  formatTime(dateStr: string): string {
    return formatChatTime(dateStr, 'time');
  }
}
