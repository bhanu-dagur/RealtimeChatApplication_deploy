import { Component, Input, Output, EventEmitter, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-message-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './message-input.component.html',
  styleUrls: ['./message-input.component.scss']
})
export class MessageInputComponent implements OnDestroy {
  @Input() placeholder = 'Type a message...';
  @Input() disabled = false;

  @Output() sendMessage = new EventEmitter<string>();
  @Output() typingChange = new EventEmitter<boolean>();

  message = '';
  private typingTimer?: ReturnType<typeof setTimeout>;

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
      return;
    }

    this.typingChange.emit(true);
    clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => {
      this.typingChange.emit(false);
    }, 2000);
  }

  send(): void {
    const content = this.message.trim();
    if (!content || this.disabled) return;
    this.sendMessage.emit(content);
    this.message = '';
    this.typingChange.emit(false);
    clearTimeout(this.typingTimer);
  }

  ngOnDestroy(): void {
    clearTimeout(this.typingTimer);
  }
}
