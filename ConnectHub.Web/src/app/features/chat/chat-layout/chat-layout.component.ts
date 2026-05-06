import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-chat-layout',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet />`
})
export class ChatLayoutComponent { }