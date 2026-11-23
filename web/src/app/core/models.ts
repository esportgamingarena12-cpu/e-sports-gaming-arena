export type Role = 'admin' | 'staff' | 'customer';

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: Role;
  active: boolean;
  /** the version of the Terms and Privacy Policy a customer agreed to (null = never) */
  consent_version?: string | null;
}

/** Where each role lands after login (and when sent away from a wrong area). */
export function homeFor(role: Role | null | undefined): string {
  switch (role) {
    case 'admin':
      return '/admin';
    case 'staff':
      return '/counter';
    default:
      return '/book';
  }
}
