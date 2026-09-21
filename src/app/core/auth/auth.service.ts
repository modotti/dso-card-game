import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService);

  async ensurePlayerIdentity(): Promise<string> {
    const { data: sessionData } = await this.supabase.client.auth.getSession();
    if (sessionData.session) return sessionData.session.user.id;

    const { data, error } = await this.supabase.client.auth.signInAnonymously();
    if (error || !data.user) throw error ?? new Error('ANONYMOUS_AUTH_FAILED');
    return data.user.id;
  }
}
