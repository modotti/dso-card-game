import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AdminAuthService } from '../../data-access/admin-auth.service';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './admin-login.component.html',
  styleUrl: './admin-login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLoginComponent {
  private readonly auth = inject(AdminAuthService);
  private readonly router = inject(Router);
  protected email = '';
  protected readonly sending = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal(false);

  constructor() {
    void this.redirectIfAuthorized();
  }

  protected async submit(): Promise<void> {
    if (!this.email.trim() || this.sending()) return;
    this.sending.set(true);
    this.error.set(false);
    try {
      await this.auth.sendMagicLink(this.email);
      this.sent.set(true);
    } catch {
      this.error.set(true);
    } finally {
      this.sending.set(false);
    }
  }

  private async redirectIfAuthorized(): Promise<void> {
    if (await this.auth.isAdmin()) await this.router.navigateByUrl('/backoffice');
  }
}
