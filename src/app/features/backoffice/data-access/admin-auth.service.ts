import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';

@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  private readonly supabase = inject(SupabaseService);

  async sendMagicLink(email: string): Promise<void> {
    const { error } = await this.supabase.client.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${location.origin}/backoffice`,
        shouldCreateUser: false,
      },
    });
    if (error) throw error;
  }

  async isAdmin(): Promise<boolean> {
    const { data: sessionData } = await this.supabase.client.auth.getSession();
    if (!sessionData.session || sessionData.session.user.is_anonymous) return false;
    const { data, error } = await this.supabase.client.rpc('is_backoffice_admin');
    return !error && data === true;
  }

  async signOut(): Promise<void> {
    const { error } = await this.supabase.client.auth.signOut();
    if (error) throw error;
  }
}
