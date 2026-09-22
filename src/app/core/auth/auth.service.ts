import { Injectable, inject } from '@angular/core';
import { AnalyticsService } from '../analytics/analytics.service';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService);
  private readonly analytics = inject(AnalyticsService);

  async ensurePlayerIdentity(): Promise<string> {
    const { data: sessionData } = await this.supabase.client.auth.getSession();
    if (sessionData.session) {
      this.analytics.identify(sessionData.session.user.id);
      return sessionData.session.user.id;
    }

    const { data, error } = await this.supabase.client.auth.signInAnonymously();
    if (error || !data.user) throw error ?? new Error('ANONYMOUS_AUTH_FAILED');
    this.analytics.identify(data.user.id);
    return data.user.id;
  }
}
