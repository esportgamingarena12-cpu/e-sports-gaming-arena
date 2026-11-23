import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { consentNeeded, LEGAL_VERSION, LegalInfo, LegalService, legalDate } from '../core/legal';
import { confirmMatches, deleteFailure, exportFileName, exportText, MyDataExport } from '../book/my-data-utils';
import { contactList, grievanceSections, PAGE_TITLES, privacySections, refundSections, sectionsFor, termsSections, whoText } from './legal-content';
import { LegalPage } from './legal-page';

const info: LegalInfo = {
  shop_name: 'E-Sports Gaming Arena',
  legal_name: 'Esports Gaming Arena LLP',
  address: '12 Main Road, Pune',
  phone: '020 1234 5678',
  gstin: '27ABCDE1234F1Z5',
  grievance_name: 'A. Sharma',
  grievance_email: 'privacy@example.com',
  grievance_phone: '98765 43210',
  refund_days: 7,
  record_years: 8,
  cutoff_hours: 2,
};
const empty: LegalInfo = {
  shop_name: null, legal_name: null, address: null, phone: null, gstin: null,
  grievance_name: null, grievance_email: null, grievance_phone: null, refund_days: 7, record_years: 8, cutoff_hours: null,
};
const text = (s: ReturnType<typeof privacySections>): string => JSON.stringify(s);

describe('consent rule', () => {
  it('a customer who never agreed must agree', () => {
    expect(consentNeeded({ role: 'customer', consent_version: null })).toBe(true);
    expect(consentNeeded({ role: 'customer' })).toBe(true);
  });
  it('a customer who agreed to older wording must agree again', () => {
    expect(consentNeeded({ role: 'customer', consent_version: '2020-01-01' })).toBe(true);
  });
  it('a customer who agreed to the current wording is not asked', () => {
    expect(consentNeeded({ role: 'customer', consent_version: LEGAL_VERSION })).toBe(false);
  });
  it('staff, admin and signed-out visitors are never asked', () => {
    expect(consentNeeded({ role: 'staff', consent_version: null })).toBe(false);
    expect(consentNeeded({ role: 'admin', consent_version: null })).toBe(false);
    expect(consentNeeded(null)).toBe(false);
  });
  it('the version is a date and prints in plain words', () => {
    expect(LEGAL_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(legalDate('2026-11-23')).toBe('23 November 2026');
  });
});

describe('legal wording', () => {
  it('every page has a title and sections with text', () => {
    for (const k of ['terms', 'privacy', 'refunds', 'grievance'] as const) {
      expect(PAGE_TITLES[k].length).toBeGreaterThan(3);
      const s = sectionsFor(k, info);
      expect(s.length).toBeGreaterThan(2);
      for (const sec of s) {
        expect(sec.title.length).toBeGreaterThan(1);
        expect(sec.body.length).toBeGreaterThan(0);
      }
    }
  });
  it('the privacy policy covers the notice items: what, why, who, how long, rights, children, contact', () => {
    const titles = privacySections(info).map((s) => s.title);
    for (const need of ['Who we are', 'What we collect', 'Why we use it', 'Your consent', 'Who else handles your data', 'How long we keep it', 'Your rights', 'Children', 'Contact']) {
      expect(titles).toContain(need);
    }
    expect(text(privacySections(info))).toContain('Data Protection Board of India');
  });
  it('uses the shop\'s own details and numbers', () => {
    const t = text(privacySections(info));
    expect(t).toContain('Esports Gaming Arena LLP');
    expect(t).toContain('12 Main Road, Pune');
    expect(t).toContain('8 years');
    expect(text(refundSections(info))).toContain('within 7 days');
    expect(text(refundSections(info))).toContain('2 hours before');
    expect(text(termsSections(info))).toContain('2 hours before');
  });
  it('says one day, not "1 days"', () => {
    expect(text(refundSections({ ...info, refund_days: 1 }))).toContain('within 1 day');
    expect(text(refundSections({ ...info, refund_days: 1 }))).not.toContain('1 days');
  });
  it('still reads properly when nothing is set', () => {
    expect(whoText(empty)).toBe('the arena');
    expect(contactList(empty)).toEqual(['Please ask at the counter for our privacy contact.']);
    expect(text(refundSections(empty))).toContain('the cut-off time shown when you book');
    expect(text(grievanceSections(empty)).length).toBeGreaterThan(100);
  });
  it('leaves out contact lines that are not set and falls back to the shop phone', () => {
    const lines = contactList({ ...empty, grievance_email: 'a@b.in', phone: '0123' });
    expect(lines).toEqual(['Email: a@b.in', 'Phone: 0123']);
  });
  it('children: asks for a parent or guardian', () => {
    expect(text(privacySections(info))).toContain('parent or guardian');
    expect(text(termsSections(info))).toContain('parent or guardian');
  });
  it('no list is empty and no text mentions a placeholder', () => {
    for (const k of ['terms', 'privacy', 'refunds', 'grievance'] as const) {
      for (const sec of sectionsFor(k, info)) for (const b of sec.body) if (typeof b !== 'string') expect(b.list.length).toBeGreaterThan(0);
      expect(text(sectionsFor(k, info))).not.toMatch(/TODO|lorem|undefined|null/i);
    }
  });
});

describe('legal page', () => {
  async function draw(page: string, loaded: LegalInfo | Error) {
    await TestBed.configureTestingModule({
      imports: [LegalPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data: { page } } } },
        { provide: LegalService, useValue: { info: () => (loaded instanceof Error ? Promise.reject(loaded) : Promise.resolve(loaded)) } },
      ],
    }).compileComponents();
    const f = TestBed.createComponent(LegalPage);
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    return f.nativeElement as HTMLElement;
  }

  it('draws the privacy page with the shop details', async () => {
    const el = await draw('privacy', info);
    expect(el.querySelector('[data-legal-title]')?.textContent).toContain('Privacy Policy');
    expect(el.textContent).toContain('Esports Gaming Arena LLP');
    expect(el.querySelector('[data-legal-version]')?.textContent).toContain(LEGAL_VERSION);
    expect(el.querySelector('[data-legal-links]')).toBeTruthy();
  });
  it('draws each of the four pages', async () => {
    for (const p of ['terms', 'refunds', 'grievance']) {
      TestBed.resetTestingModule();
      const el = await draw(p, info);
      expect(el.querySelector(`[data-legal-page="${p}"]`)).toBeTruthy();
    }
  });
  it('still shows the words when the shop details cannot be loaded', async () => {
    const el = await draw('terms', new Error('offline'));
    expect(el.querySelector('[data-legal-title]')?.textContent).toContain('Terms');
    expect(el.textContent).toContain('Your account');
  });
});

describe('my data tools', () => {
  it('delete needs the word, in any case', () => {
    expect(confirmMatches('DELETE')).toBe(true);
    expect(confirmMatches('  delete ')).toBe(true);
    expect(confirmMatches('delet')).toBe(false);
    expect(confirmMatches('')).toBe(false);
  });
  it('names the download by the India date', () => {
    expect(exportFileName(new Date('2026-11-23T10:00:00Z'))).toBe('my-data-2026-11-23.json');
    // 20:00 UTC is already the next day in India
    expect(exportFileName(new Date('2026-11-23T20:00:00Z'))).toBe('my-data-2026-11-24.json');
  });
  it('the download is readable JSON', () => {
    const d: MyDataExport = { exported_at: 'x', account: null, customer_record: null, bookings: [], passes: [], bills: [] };
    expect(JSON.parse(exportText(d))).toEqual(d);
  });
  it('an active pass is told apart from other delete errors', () => {
    expect(deleteFailure({ code: 'PB001', message: 'You still have an active pass.' })).toEqual({ passes: true, text: 'You still have an active pass.' });
    expect(deleteFailure({ code: 'P0001', message: 'You have a session in progress' }).passes).toBe(false);
    expect(deleteFailure({}).text).toContain('Could not delete');
  });
});
