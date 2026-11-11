// Fails if the built web app contains anything but the public "anon" key.
// Usage: node scripts/check-build-keys.mjs [dist folder]   (default: dist/web/browser)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? 'dist/web/browser';
const files = [];
const walk = (d) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    statSync(p).isDirectory() ? walk(p) : /\.(js|json|html|css|webmanifest|map)$/.test(n) && files.push(p);
  }
};
walk(root);

const problems = [];
const roles = new Set();
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  // library doc comments (development builds, source maps) may mention the name; only code counts
  const code = f.endsWith('.map')
    ? ''
    : text
        .split('\n')
        .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
        .join('\n');
  if (/service_role/i.test(code)) problems.push(`${f}: contains the text "service_role"`);
  for (const m of text.match(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) ?? []) {
    try {
      const role = JSON.parse(Buffer.from(m.split('.')[1], 'base64url').toString('utf8')).role;
      roles.add(String(role));
      if (role !== 'anon') problems.push(`${f}: a key with role "${role}"`);
    } catch {
      problems.push(`${f}: a token that could not be decoded`);
    }
  }
  if (/PASTE_PRODUCTION/.test(text)) problems.push(`${f}: still has the PASTE_PRODUCTION placeholder`);
}
console.log(`Scanned ${files.length} files. Key roles found: ${[...roles].join(', ') || 'none'}`);
if (problems.length) {
  console.error('PROBLEMS:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log('OK: no service_role key, only the public anon key.');
