import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'board' },
  {
    path: 'board',
    title: 'Board · Agentic Board',
    loadComponent: () => import('./features/board/board-page').then((m) => m.BoardPage),
  },
  {
    path: 'about',
    title: 'About · Agentic Board',
    loadComponent: () => import('./features/about/about-page').then((m) => m.AboutPage),
  },
  { path: '**', redirectTo: 'board' },
];
