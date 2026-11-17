import { inject, Injectable } from '@angular/core';
import { SupabaseService } from '../../core/supabase.service';
import { friendlyError } from '../../shared/errors';
import { todayIst } from '../../shared/format';
import { DashboardData, DashStation, HourRow, LiveSession, SalesReport, TrendRow } from './report-utils';

/** Wrapper over the reporting functions. Every method throws an Error with a plain message. */
@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly sb = inject(SupabaseService).client;

  private async call<T>(fn: string, args?: object): Promise<T> {
    const { data, error } = await this.sb.rpc(fn, args);
    if (error) throw new Error(friendlyError(error));
    return data as T;
  }

  dashboard(): Promise<DashboardData> {
    return this.call('dashboard_today');
  }
  trend(days = 30): Promise<TrendRow[]> {
    return this.call('sales_trend', { p_days: days });
  }
  busyHours(days = 30): Promise<HourRow[]> {
    return this.call('busy_hours', { p_days: days });
  }
  report(from: string, to: string): Promise<SalesReport> {
    return this.call('sales_report', { p_from: from, p_to: to });
  }
  today(): Promise<SalesReport> {
    return this.call('today_report');
  }

  /** Every station with its on/off flag (staff and admin can read stations). */
  async stations(): Promise<DashStation[]> {
    const { data, error } = await this.sb.from('stations').select('id, name, type, active').order('sort_order').order('name');
    if (error) throw new Error(friendlyError(error));
    return (data ?? []) as DashStation[];
  }

  /** Sessions started today (India time), cancelled ones left out, and how many of them came from a booking. */
  async sessionsToday(): Promise<{ total: number; booked: number }> {
    const from = new Date(`${todayIst()}T00:00:00+05:30`).toISOString();
    const base = () => this.sb.from('sessions').select('id', { count: 'exact', head: true }).gte('started_at', from).neq('status', 'cancelled');
    const [all, booked] = await Promise.all([base(), base().not('booking_id', 'is', null)]);
    if (all.error) throw new Error(friendlyError(all.error));
    return { total: all.count ?? 0, booked: booked.count ?? 0 };
  }

  /** Sessions that are running or paused right now. */
  async liveSessions(): Promise<LiveSession[]> {
    const { data, error } = await this.sb
      .from('sessions')
      .select('id, station_id, customer_name, status, pass_name, rate_per_hour, block_min, min_bill_min, package_minutes, package_price, pass_id, pass_minutes_left, started_at, paused_at, paused_seconds, ended_at')
      .in('status', ['running', 'paused'])
      .order('started_at');
    if (error) throw new Error(friendlyError(error));
    return (data ?? []) as LiveSession[];
  }
}
