// Copies the static client into worker/public so Wrangler only ever uploads
// site files — never .env.local, .vercel, node_modules, api/ or lib/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'worker', 'public');
const entries = ['index.html', 'health.html', 'insights.html', 'css', 'js', 'shared'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const entry of entries) {
  const from = path.join(root, entry);
  if (!fs.existsSync(from)) throw new Error(`missing ${entry}`);
  fs.cpSync(from, path.join(out, entry), { recursive: true });
}

// Keep any future dotfiles out of the upload.
fs.writeFileSync(path.join(out, '.assetsignore'), '*.map\n');

console.log(`worker/public ready (${entries.join(', ')})`);
