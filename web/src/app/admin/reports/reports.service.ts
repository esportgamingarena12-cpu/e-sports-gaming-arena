import { inject, Injectable } from '@angular/core';
import { SupabaseService } from '../../core/supabase.service';
import { friendlyError } from '../../shared/errors';
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
