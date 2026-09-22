import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/pages/home-page/home-page.component').then((m) => m.HomePageComponent),
    title: 'Deep Space Duel',
  },
  {
    path: 'join/:code',
    loadComponent: () => import('./features/home/pages/home-page/home-page.component').then((m) => m.HomePageComponent),
    title: 'Join game · Deep Space Duel',
  },
  {
    path: 'lobby/:code',
    loadComponent: () =>
      import('./features/lobby/pages/lobby-page/lobby-page.component').then((m) => m.LobbyPageComponent),
    title: 'Lobby · Deep Space Duel',
  },
  {
    path: 'game/:code',
    loadComponent: () => import('./features/game/pages/game-page/game-page.component').then((m) => m.GamePageComponent),
    title: 'Game · Deep Space Duel',
  },
  {
    path: 'privacidade',
    loadComponent: () =>
      import('./features/legal/pages/privacy-page/privacy-page.component').then((m) => m.PrivacyPageComponent),
    title: 'Privacidade · Deep Space Duel',
  },
  { path: '**', redirectTo: '' },
];
