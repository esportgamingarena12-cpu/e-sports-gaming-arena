import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';
import { adminGuard, customerGuard, staffGuard } from './guards';
import { Profile, Role } from './models';

function profile(role: Role): Profile {
  return { id: '1', email: 'a@b.c', full_name: 'T', phone: null, role, active: true };
}

async function run(guard: typeof adminGuard, p: Profile | null): Promise<string | true> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { whenReady: () => Promise.resolve(), profile: signal(p) } },
    ],
  });
  const result = await TestBed.runInInjectionContext(() => guard({} as never, {} as never));
  return result === true ? true : TestBed.inject(Router).serializeUrl(result as UrlTree);
}

describe('role guards', () => {
  it('admin reaches /admin and /counter', async () => {
    expect(await run(adminGuard, profile('admin'))).toBe(true);
    expect(await run(staffGuard, profile('admin'))).toBe(true);
  });

  it('staff reaches /counter but is sent home from /admin', async () => {
    expect(await run(staffGuard, profile('staff'))).toBe(true);
    expect(await run(adminGuard, profile('staff'))).toBe('/counter');
  });

  it('customer is sent to /book from admin and counter areas', async () => {
    expect(await run(adminGuard, profile('customer'))).toBe('/book');
    expect(await run(staffGuard, profile('customer'))).toBe('/book');
  });

  it('customer area sends staff and admin to their own home', async () => {
    expect(await run(customerGuard, profile('customer'))).toBe(true);
    expect(await run(customerGuard, profile('staff'))).toBe('/counter');
    expect(await run(customerGuard, profile('admin'))).toBe('/admin');
  });

  it('signed-out users go to the right login page', async () => {
    expect(await run(adminGuard, null)).toBe('/login');
    expect(await run(staffGuard, null)).toBe('/login');
    expect(await run(customerGuard, null)).toBe('/book/login');
  });
});
