import { Component, EventEmitter, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

// A lightweight, dependency-free emoji palette. Covers the high-frequency
// WhatsApp/Slack picker subset; adding emoji-mart would have pulled in a
// non-trivial dependency tree for marginal benefit. Rows are grouped into
// tabs so the popover stays scannable.
interface EmojiTab {
  name: string;
  icon: string;
  emojis: string[];
}

const TABS: EmojiTab[] = [
  {
    name: 'Smileys',
    icon: '😀',
    emojis: [
      '😀','😃','😄','😁','😆','🥹','😅','😂','🤣','🥲','☺️','😊','😇','🙂','🙃',
      '😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐',
      '🤓','😎','🥸','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖',
      '😫','😩','🥺','😢','😭','😮‍💨','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😶‍🌫️',
      '😱','😨','😰','😥','😓','🤗','🤔','🫣','🤭','🫢','🫡','🤫','🫠','🤥','😶'
    ]
  },
  {
    name: 'Gestures',
    icon: '👍',
    emojis: [
      '👍','👎','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','🖕',
      '👇','☝️','👋','🤚','🖐','✋','🖖','👏','🙌','🫶','🤝','🙏','✍️','💪','🦾',
      '🦵','🦶','👂','🦻','👃','👀','👁','🧠','🫀','🫁','🦷','🦴','👶','🧒','👦'
    ]
  },
  {
    name: 'Hearts',
    icon: '❤️',
    emojis: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗',
      '💖','💘','💝','💟','♥️','💌','💋','🌹','🌷','🌸','💐','🌺','🌻','🌼','🪷'
    ]
  },
  {
    name: 'Objects',
    icon: '🎉',
    emojis: [
      '🎉','🎊','🎁','🎂','🎈','🎀','🪅','🪩','🎆','🎇','✨','💫','🌟','⭐','🌈',
      '🔥','💥','💯','✅','❌','⚠️','📌','📍','📎','🔗','📞','📱','💻','⌨️','🖱',
      '🎵','🎶','🎤','🎧','📷','📸','🎬','🎮','🕹','🏆','🥇','🥈','🥉','⚽','🏀'
    ]
  },
  {
    name: 'Food',
    icon: '🍕',
    emojis: [
      '🍕','🍔','🍟','🌭','🥪','🌮','🌯','🥗','🍝','🍜','🍣','🍱','🍤','🍙','🍘',
      '🍚','🍛','🍲','🥘','🥟','🥠','🫔','🍳','🥞','🧇','🥓','🥩','🍗','🍖','🦴',
      '🍎','🍏','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍒','🥥','🍍','🥭','🥝'
    ]
  }
];

@Component({
  selector: 'app-emoji-picker',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="emoji-popover" (click)="$event.stopPropagation()">
      <div class="emoji-tabs">
        @for (tab of tabs; track tab.name) {
          <button
            class="emoji-tab"
            [class.active]="activeTabIndex() === $index"
            [title]="tab.name"
            (click)="activeTabIndex.set($index)">
            {{ tab.icon }}
          </button>
        }
      </div>
      <div class="emoji-grid">
        @for (e of currentEmojis(); track $index) {
          <button class="emoji-cell" type="button" (click)="pick(e)">{{ e }}</button>
        }
      </div>
    </div>
  `,
  styles: [`
    .emoji-popover {
      width: 296px;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.18);
      overflow: hidden;
      animation: pop 0.12s ease;
    }
    @keyframes pop { from { transform: translateY(4px); opacity: 0; } to { transform: none; opacity: 1; } }
    .emoji-tabs {
      display: flex;
      border-bottom: 1px solid #f1f5f9;
      background: #fafafa;
    }
    .emoji-tab {
      flex: 1;
      padding: 8px 0;
      border: none;
      background: transparent;
      font-size: 16px;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: background 0.12s, border-color 0.12s;
    }
    .emoji-tab:hover { background: #f3f4f6; }
    .emoji-tab.active { border-bottom-color: var(--teal, #0ea5a3); background: #fff; }
    .emoji-grid {
      padding: 6px;
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      gap: 2px;
      max-height: 240px;
      overflow-y: auto;
    }
    .emoji-cell {
      border: none;
      background: transparent;
      padding: 4px 0;
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      border-radius: 6px;
      transition: background 0.1s;
    }
    .emoji-cell:hover { background: #f3f4f6; }
  `]
})
export class EmojiPickerComponent {
  @Output() emojiSelected = new EventEmitter<string>();

  tabs = TABS;
  activeTabIndex = signal(0);
  currentEmojis = () => this.tabs[this.activeTabIndex()]?.emojis ?? [];

  pick(emoji: string): void {
    this.emojiSelected.emit(emoji);
  }
}
