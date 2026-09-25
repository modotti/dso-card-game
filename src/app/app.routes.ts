import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/pages/home-page/home-page.component').then((m) => m.HomePageComponent),
    title: 'Deep Sky Duels',
  },
  {
    path: 'join/:code',
    loadComponent: () => import('./features/home/pages/home-page/home-page.component').then((m) => m.HomePageComponent),
    title: 'Join game · Deep Sky Duels',
  },
  {
    path: 'lobby/:code',
    loadComponent: () =>
      import('./features/lobby/pages/lobby-page/lobby-page.component').then((m) => m.LobbyPageComponent),
    title: 'Lobby · Deep Sky Duels',
  },
  {
    path: 'game/:code',
    loadComponent: () => import('./features/game/pages/game-page/game-page.component').then((m) => m.GamePageComponent),
    title: 'Game · Deep Sky Duels',
  },
  {
    path: 'catalogo',
    loadComponent: () =>
      import('./features/cards/pages/catalog-page/catalog-page.component').then((m) => m.CatalogPageComponent),
    title: 'Catálogo · Deep Sky Duels',
  },
  {
    path: 'conquistas',
    loadComponent: () =>
      import('./features/achievements/pages/achievements-page/achievements-page.component').then(
        (m) => m.AchievementsPageComponent,
      ),
    title: 'Achievements · Deep Sky Duels',
  },
  {
    path: 'privacidade',
    loadComponent: () =>
      import('./features/legal/pages/privacy-page/privacy-page.component').then((m) => m.PrivacyPageComponent),
    title: 'Privacidade · Deep Sky Duels',
  },
  {
    path: 'submit-photo',
    loadComponent: () =>
      import('./features/photo-submissions/pages/photo-submission-page/photo-submission-page.component').then(
        (m) => m.PhotoSubmissionPageComponent,
      ),
    title: 'Submit astrophotography · Deep Sky Duels',
  },
  {
    path: 'photo-terms',
    loadComponent: () =>
      import('./features/photo-submissions/pages/photo-terms-page/photo-terms-page.component').then(
        (m) => m.PhotoTermsPageComponent,
      ),
    title: 'Image Submission Terms · Deep Sky Duels',
  },
  { path: '**', redirectTo: '' },
];
