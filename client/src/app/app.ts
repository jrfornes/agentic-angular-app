import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AssistantPanel } from './features/assistant/assistant-panel';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AssistantPanel],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly assistantOpen = signal(true);
}
