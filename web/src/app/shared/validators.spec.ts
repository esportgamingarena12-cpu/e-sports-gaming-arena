import { FormControl, FormGroup, Validators } from '@angular/forms';
import { integer, maxAtLeastMin, notBlank, openBeforeClose, phone, upiId } from './validators';

describe('validators', () => {
  it('rejects negative prices with Validators.min(0)', () => {
    const c = new FormControl(-1, Validators.min(0));
    expect(c.valid).toBe(false);
    c.setValue(0);
    expect(c.valid).toBe(true);
  });

  it('rejects zero minutes with Validators.min(1)', () => {
    const c = new FormControl(0, Validators.min(1));
    expect(c.valid).toBe(false);
    c.setValue(30);
    expect(c.valid).toBe(true);
  });

  it('requires a non-blank name', () => {
    const c = new FormControl('', [Validators.required, notBlank]);
    expect(c.valid).toBe(false);
    c.setValue('   ');
    expect(c.errors).toEqual({ notBlank: true });
    c.setValue('PC 1');
    expect(c.valid).toBe(true);
  });

  it('accepts only whole numbers', () => {
    const c = new FormControl(1.5, integer);
    expect(c.errors).toEqual({ integer: true });
    c.setValue(2);
    expect(c.valid).toBe(true);
    c.setValue(null);
    expect(c.valid).toBe(true);
  });

  it('validates an optional UPI ID', () => {
    const c = new FormControl('', upiId);
    expect(c.valid).toBe(true);
    c.setValue('shop@okbank');
    expect(c.valid).toBe(true);
    c.setValue('not a upi id');
    expect(c.errors).toEqual({ upi: true });
  });

  it('validates an optional phone number', () => {
    const c = new FormControl('', phone);
    expect(c.valid).toBe(true);
    c.setValue('98765 43210');
    expect(c.valid).toBe(true);
    c.setValue('+91 9876543210');
    expect(c.valid).toBe(true);
    c.setValue('12345');
    expect(c.errors).toEqual({ phone: true });
    c.setValue('abc1234567');
    expect(c.errors).toEqual({ phone: true });
  });

  it('requires open before close unless closed', () => {
    const g = new FormGroup(
      { open_time: new FormControl('22:00'), close_time: new FormControl('10:00'), closed: new FormControl(false) },
      openBeforeClose,
    );
    expect(g.errors).toEqual({ timeRange: true });
    g.patchValue({ open_time: '10:00', close_time: '22:00' });
    expect(g.valid).toBe(true);
    g.patchValue({ open_time: '23:00', close_time: '10:00', closed: true });
    expect(g.valid).toBe(true);
  });

  it('requires max slots at least min slots', () => {
    const g = new FormGroup({ min_slots: new FormControl(5), max_slots: new FormControl(2) }, maxAtLeastMin);
    expect(g.errors).toEqual({ slotRange: true });
    g.patchValue({ max_slots: 8 });
    expect(g.valid).toBe(true);
  });
});
