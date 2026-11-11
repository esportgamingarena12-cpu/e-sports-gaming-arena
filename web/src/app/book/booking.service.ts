import { inject, Injectable } from '@angular/core';
import { SupabaseService } from '../core/supabase.service';
import { portalError, PortalBooking } from './portal';

export interface BookingInfo {
  shop_name: string | null;
  slot_minutes: number;
  min_slots: number;
  max_slots: number;
  window_days: number;
  cutoff_hours: number;
  types: string[];
  rates: { type: string; rate_per_hour: number }[];
}

export interface FreeSlot {
  slot_start: string;
  free: number;
}

export interface MyBill {
  bill_no: number;
  booking_id: number;
  created_at: string;
  station_name: string;
  subtotal: number;
  discount: number;
  total: number;
  status: string;
  items: { name: string; qty: number; amount: number }[];
  payments: { mode: string; amount: number }[];
}

/** Thin wrapper over the customer-facing database functions. Every method throws an Error with a plain message. */
@Injectable({ providedIn: 'root' })
export class BookingService {
  private readonly sb = inject(SupabaseService).client;

  private fail(error: { message?: string; code?: string }): never {
    throw new Error(portalError(error));
  }

  async info(): Promise<BookingInfo> {
    const { data, error } = await this.sb.rpc('booking_info');
    if (error) this.fail(error);
    return data as BookingInfo;
  }

  async availability(type: string, day: string, slots: number): Promise<FreeSlot[]> {
    const { data, error } = await this.sb.rpc('get_availability', { p_station_type: type, p_date: day, p_slots: slots });
    if (error) this.fail(error);
    return (data ?? []) as FreeSlot[];
  }

  async rescheduleAvailability(bookingId: number, day: string): Promise<FreeSlot[]> {
    const { data, error } = await this.sb.rpc('get_reschedule_availability', { p_booking: bookingId, p_date: day });
    if (error) this.fail(error);
    return (data ?? []) as FreeSlot[];
  }

  async book(type: string, startIso: string, slots: number): Promise<void> {
    const { error } = await this.sb.rpc('create_booking', { p_station_type: type, p_start: startIso, p_slots: slots });
    if (error) this.fail(error);
  }

  async cancel(id: number): Promise<void> {
    const { error } = await this.sb.rpc('cancel_booking', { p_booking: id });
    if (error) this.fail(error);
  }

  async reschedule(id: number, startIso: string): Promise<void> {
    const { error } = await this.sb.rpc('reschedule_booking', { p_booking: id, p_start: startIso });
    if (error) this.fail(error);
  }

  async saveProfile(name: string, phone: string): Promise<void> {
    const { error } = await this.sb.rpc('save_my_profile', { p_name: name, p_phone: phone });
    if (error) this.fail(error);
  }

  async myBookings(): Promise<PortalBooking[]> {
    const { data, error } = await this.sb
      .from('bookings')
      .select('id, station_type, start_at, end_at, slots, status')
      .order('start_at', { ascending: false })
      .limit(200);
    if (error) this.fail(error);
    return (data ?? []) as PortalBooking[];
  }

  async myBills(): Promise<MyBill[]> {
    const { data, error } = await this.sb.rpc('my_bills');
    if (error) this.fail(error);
    return (data ?? []) as MyBill[];
  }
}
