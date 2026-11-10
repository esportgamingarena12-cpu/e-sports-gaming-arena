import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';

/**
 * A 1-second ticking "now" that follows the database clock, so every counter shows the same
 * time and charge even when the devices' own clocks differ.
 */
@Injectable({ providedIn: 'root' })
export class ServerClock {
  private readonly sb = inject(SupabaseService).client;
  private offsetMs = 0;

  /** Current time in ms (server-corrected). Updates every second. */
  readonly now = signal(Date.now());

  constructor() {
    setInterval(() => this.now.set(Date.now() + this.offsetMs), 1000);
  }

  /** Measure the difference to the database clock (halving the round trip). */
  async sync(): Promise<void> {
    const t0 = Date.now();
    const { data, error } = await this.sb.rpc('server_now');
    const t1 = Date.now();
    if (error || !data) return;
    this.offsetMs = Date.parse(data as string) - (t0 + t1) / 2;
    this.now.set(Date.now() + this.offsetMs);
  }
}
