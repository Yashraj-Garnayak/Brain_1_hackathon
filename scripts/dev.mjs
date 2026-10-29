#!/usr/bin/env node
/* Runs `vercel dev` with .env.local loaded into the environment.
   vercel dev only injects env vars from the linked Vercel project, so the
   local DATABASE_URL would otherwise never reach the /api functions.
   Usage: npm run dev */

import { spawn } from 'node:child_process';

const child = spawn('npx vercel dev', process.argv.slice(2), { stdio: 'inherit', shell: true });
child.on('exit', (code) => process.exit(code ?? 0));
