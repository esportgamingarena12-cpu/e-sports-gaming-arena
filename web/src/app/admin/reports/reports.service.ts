import { inject, Injectable } from '@angular/core';
import { SupabaseService } from '../../core/supabase.service';
import { friendlyError } from '../../shared/errors';
import { DashboardData, HourRow, SalesReport, TrendRow } from './report-utils';

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
}
