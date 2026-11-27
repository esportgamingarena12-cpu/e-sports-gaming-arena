import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { apiBase, AUTH_STORAGE_KEY, createRoutedFetch, DIRECT_URL } from './api-route';

const base = apiBase();

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  /**
   * In production every request goes through this website's own door to the project (see core/api-route.ts), which keeps working on
   * internet connections that block *.supabase.co; the direct address is the fallback. Locally there is no proxy and the direct address is used.
   */
  readonly client: SupabaseClient = createClient(base, environment.SUPABASE_ANON_KEY, {
    auth: { storageKey: AUTH_STORAGE_KEY },
    ...(base !== DIRECT_URL ? { global: { fetch: createRoutedFetch({ proxy: base, direct: DIRECT_URL }) } } : {}),
  });
}
