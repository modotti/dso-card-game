import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import { AdminAuthService } from '../data-access/admin-auth.service';

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AdminAuthService);
  const router = inject(Router);
  return (await auth.isAdmin()) || router.createUrlTree(['/backoffice/login']);
};
