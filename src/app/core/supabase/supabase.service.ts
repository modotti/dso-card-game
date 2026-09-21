import { Injectable } from '@angular/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private clientInstance?: SupabaseClient;

  get isConfigured(): boolean {
    return environment.supabaseUrl.startsWith('https://') && !environment.supabasePublishableKey.startsWith('YOUR_');
  }

  get client(): SupabaseClient {
    if (!this.isConfigured) throw new Error('SUPABASE_NOT_CONFIGURED');
    return (this.clientInstance ??= createClient(environment.supabaseUrl, environment.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    }));
  }
}
