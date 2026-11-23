import { LegalInfo } from '../core/legal';

/**
 * The wording of the public legal pages. Plain language on purpose (India's DPDP Act asks for a notice that is clear and simple).
 * NOTE FOR THE OWNER: this is a careful starting text, not legal advice. Have a lawyer read it before you rely on it,
 * and change LEGAL_VERSION in core/legal.ts whenever the wording changes so customers agree again.
 */
export type Block = string | { list: string[] };
export interface Section {
  title: string;
  body: Block[];
}
export type LegalPageKey = 'terms' | 'privacy' | 'refunds' | 'grievance';

export const PAGE_TITLES: Record<LegalPageKey, string> = {
  terms: 'Terms & Conditions',
  privacy: 'Privacy Policy',
  refunds: 'Refund & Cancellation Policy',
  grievance: 'Contact & Grievance',
};

/** Who we are: the registered name if set, else the shop name. */
export const whoText = (i: LegalInfo): string => i.legal_name?.trim() || i.shop_name?.trim() || 'the arena';

const clean = (s: string | null | undefined): string => (s ?? '').trim();

/** Contact lines that exist (empty ones are left out); if none are set, tell the visitor to ask at the counter. */
export function contactList(i: LegalInfo): string[] {
  const out: string[] = [];
  if (clean(i.grievance_name)) out.push(`Grievance Officer: ${clean(i.grievance_name)}`);
  if (clean(i.grievance_email)) out.push(`Email: ${clean(i.grievance_email)}`);
  if (clean(i.grievance_phone) || clean(i.phone)) out.push(`Phone: ${clean(i.grievance_phone) || clean(i.phone)}`);
  if (clean(i.address)) out.push(`Address: ${clean(i.address)}`);
  if (!out.length) out.push('Please ask at the counter for our privacy contact.');
  return out;
}

const hours = (n: number | null): string => (n === null ? 'the cut-off time shown when you book' : `${n} hour${n === 1 ? '' : 's'}`);

export function privacySections(i: LegalInfo): Section[] {
  const who = whoText(i);
  return [
    {
      title: 'Who we are',
      body: [
        `${who} ("we", "us") runs the gaming arena and this website. Under India's Digital Personal Data Protection Act, 2023 we are the "Data Fiduciary": we decide why and how your personal data is used.`,
        { list: [clean(i.address) ? `Address: ${clean(i.address)}` : 'Address: shown at the counter', clean(i.phone) ? `Phone: ${clean(i.phone)}` : '', clean(i.gstin) ? `GSTIN: ${clean(i.gstin)}` : ''].filter(Boolean) },
      ],
    },
    {
      title: 'What we collect',
      body: [
        { list: [
          'Your account: name, phone number and email address (typed by you, or given by Google if you sign in with Google).',
          'Your bookings: which type of station, the date and time, how many slots, and any note you add.',
          'Your passes and bills: what you bought or played, the amounts, and how you paid (cash or UPI). We never see or store your card or UPI PIN.',
          'Counter records: if you play without an account, the staff may type your name and phone to run your session and bill.',
          'Your password is handled by our sign-in service and is stored only in scrambled (hashed) form. Neither we nor our staff can read it.',
          'Technical data kept in your browser: only what is needed to keep you signed in and to let the site work when the network is slow. We use no advertising or tracking cookies and no analytics.',
        ] },
      ],
    },
    {
      title: 'Why we use it',
      body: [
        { list: [
          'To create your account, hold your booking, run your play session, make your bill and manage your pass.',
          'To send service emails about your booking: confirmation, change, cancellation and a reminder. These are not advertising.',
          'To keep the shop\'s accounts and tax records as the law requires.',
          'To keep the site safe and stop misuse, and to answer your requests and complaints.',
        ] },
        'We do not sell your data. We do not send marketing messages. If we ever want to, we will ask you separately and you can say no.',
      ],
    },
    {
      title: 'Your consent',
      body: [
        'We use your personal data for the purposes above because you agree when you create your account or make your first booking. You can withdraw that agreement at any time by deleting your account (see "Your rights"). Withdrawing does not affect anything done before, and records we must keep by law stay, without your name.',
        'If we change this policy in a way that matters, we will ask you to read it and agree again.',
      ],
    },
    {
      title: 'Who else handles your data',
      body: [
        'Our staff see your bookings and bills so they can serve you. They sign in with their own logins and can only see what their job needs.',
        'We use trusted service providers to run the website. They handle data only on our instructions:',
        { list: [
          'Cloudflare: hosts the website.',
          'Supabase: stores our database and runs sign-in.',
          'Resend: sends the booking emails.',
          'Google: only if you choose "Continue with Google".',
        ] },
        'Some of these providers may keep data on servers outside India. We share data with authorities only when the law requires it.',
      ],
    },
    {
      title: 'How long we keep it',
      body: [
        { list: [
          'Your account, bookings and pass details: until you delete your account.',
          `Bookings, bills and payment records: ${i.record_years} years, because tax and accounting law requires shop records. After you delete your account they stay, without your name, phone or email.`,
          'Booking emails waiting to be sent: removed when you delete your account.',
        ] },
      ],
    },
    {
      title: 'Your rights',
      body: [
        'You can, at any time and free of charge:',
        { list: [
          'See and download what we hold about you: sign in and open "My data & privacy".',
          'Correct it: change your name and phone in "My data & privacy" (or ask the counter).',
          'Delete your account: in "My data & privacy". Your login is removed and your name, phone and email are wiped from our records. You must first finish or cancel any upcoming booking. Your bookings, bills and payments stay in the shop\'s records without your name, and an unused pass can no longer be used and is not refunded.',
          'Withdraw your consent: delete your account, or write to us.',
          'Name another person to exercise these rights for you if you die or cannot act for yourself: write to us with their details.',
          'Complain: see "Contact & Grievance". If we do not solve it, you may complain to the Data Protection Board of India.',
        ] },
        'If you only ever played at the counter and have no account, ask us in person or by email and we will help.',
      ],
    },
    {
      title: 'Children',
      body: [
        'If you are under 18, a parent or guardian must agree to these terms for you, and you should use the arena with their permission. We do not track children, show them advertising or build profiles of them. A parent or guardian can ask us at any time to see or delete a child\'s data.',
      ],
    },
    {
      title: 'Keeping it safe',
      body: [
        'Connections to the site are encrypted. Access is limited by role, passwords are hashed, and customers can only see their own records. If a data breach affects you, we will tell you and the Data Protection Board of India as the law requires.',
      ],
    },
    { title: 'Contact', body: [{ list: contactList(i) }] },
  ];
}

export function termsSections(i: LegalInfo): Section[] {
  const who = whoText(i);
  return [
    {
      title: 'About these terms',
      body: [
        `These terms apply when you use the website or the gaming arena run by ${who}. By creating an account, making a booking or playing, you agree to them and to our Privacy Policy.`,
      ],
    },
    {
      title: 'Your account',
      body: [
        { list: [
          'Give true details and keep your password to yourself. You are responsible for what happens through your account.',
          'One person, one account. Do not use someone else\'s.',
          'You must be 18 or older. If you are younger, a parent or guardian must agree to these terms for you and you may play only with their permission.',
          'We may suspend an account that is misused, after telling you why where we can.',
        ] },
      ],
    },
    {
      title: 'Bookings',
      body: [
        { list: [
          'A booking holds a station for the time you choose. No payment is taken online: you pay at the counter after you play.',
          `You can cancel or change a booking yourself until ${hours(i.cutoff_hours)} before it starts. After that, please call the counter.`,
          'The counter may release a station that nobody has claimed, so please arrive on time.',
        ] },
      ],
    },
    {
      title: 'Playing and paying',
      body: [
        { list: [
          'Prices are on the rate card on the Book page. Time is charged in the blocks shown there, with the minimum charge shown there.',
          'If you stay past your time or package, the extra time is charged as the counter explains; a short grace period may be allowed at the counter\'s discretion.',
          'Canteen items are charged at the prices shown. You pay your bill at the counter in cash or by UPI.',
          'Passes are valid for the period and stations they say. Unused time ends when the pass expires.',
        ] },
      ],
    },
    {
      title: 'Behaviour and equipment',
      body: [
        { list: [
          'Treat the staff, other players and the equipment with respect.',
          'Do not install software, change settings or use another person\'s accounts or games on our machines.',
          'You may have to pay for damage you cause.',
          'We may ask anyone who is unsafe or disruptive to leave.',
        ] },
      ],
    },
    {
      title: 'Our responsibility',
      body: [
        'We try to keep the arena and website running well, but we cannot promise they will always be available or free of faults. Please look after your own belongings. As far as the law allows, we are not responsible for loss that could not reasonably be foreseen, and our responsibility for any one claim is limited to the amount you paid us for the service concerned. Nothing here limits rights you have under consumer law.',
      ],
    },
    {
      title: 'Refunds, privacy and complaints',
      body: ['Refunds and cancellations are explained in the Refund & Cancellation Policy. How we use your data is explained in the Privacy Policy. To complain, see Contact & Grievance.'],
    },
    {
      title: 'Changes and law',
      body: [
        'We may change these terms. The date at the top shows the current version, and we will ask you to agree again when a change matters. These terms follow the laws of India, and the courts of the place where the arena is located can hear any dispute.',
      ],
    },
    { title: 'Contact', body: [{ list: contactList(i) }] },
  ];
}

export function refundSections(i: LegalInfo): Section[] {
  const days = `${i.refund_days} day${i.refund_days === 1 ? '' : 's'}`;
  return [
    {
      title: 'Bookings',
      body: [
        `No payment is taken when you book online, so there is nothing to refund. You can cancel online until ${hours(i.cutoff_hours)} before the start at no cost. After that, please call the counter.`,
      ],
    },
    {
      title: 'Time you played',
      body: [
        'You pay for the time you used. If a machine faults or something goes wrong while you play, tell the staff straight away: they will fix the bill or give you the time back. Please do not wait until you have left.',
      ],
    },
    {
      title: 'Passes',
      body: [
        'A pass can be used until its expiry date. Time left on a pass when it expires, or when you delete your account, is not refunded. If you bought a pass by mistake or the arena cannot give you the service, tell the counter and we will work it out with you.',
      ],
    },
    {
      title: 'Canteen',
      body: ['Items cannot be returned once served. If an item is wrong or spoiled, tell the staff and we will replace it or take it off your bill.'],
    },
    {
      title: 'How refunds are paid',
      body: [`When we agree to a refund, we pay it back the way you paid (cash or UPI) within ${days}. A bill cancelled by the counter is reversed in our records.`],
    },
    { title: 'Contact', body: [{ list: contactList(i) }] },
  ];
}

export function grievanceSections(i: LegalInfo): Section[] {
  return [
    {
      title: 'Talk to us first',
      body: [
        'If something is wrong with a booking, a bill, or how we handle your data, please tell us. We want to put it right.',
        { list: contactList(i) },
      ],
    },
    {
      title: 'What to include',
      body: ['Your name, the phone or email on your account, what happened and what you would like us to do. If it is about your data, say whether you want to see it, correct it, delete it or withdraw your consent.'],
    },
    {
      title: 'What happens next',
      body: [
        'We will reply within 7 days and aim to solve it within 30 days. The law allows up to 90 days for data requests, but we try to be faster.',
        'If you are not happy with our answer, you may complain to the Data Protection Board of India.',
      ],
    },
    {
      title: 'Doing it yourself',
      body: ['Signed-in customers can see, correct, download and delete their data any time in "My data & privacy" without waiting for anyone.'],
    },
  ];
}

export function sectionsFor(page: LegalPageKey, info: LegalInfo): Section[] {
  switch (page) {
    case 'terms': return termsSections(info);
    case 'privacy': return privacySections(info);
    case 'refunds': return refundSections(info);
    case 'grievance': return grievanceSections(info);
  }
}
