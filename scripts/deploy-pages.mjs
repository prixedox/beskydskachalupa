// Publishes the preview to GitHub Pages (branch gh-pages of origin):
//   /beskydskachalupa/            the website from site/
//   /beskydskachalupa/prohlidka/  the tour app, built from the current working tree
// Usage: node scripts/deploy-pages.mjs
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = '/beskydskachalupa/';
// npx is a .cmd file on Windows and needs a shell; git must not get one (it would split args with spaces).
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: cmd === 'npx' && process.platform === 'win32' });
const out = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();

const dir = join(tmpdir(), 'beskydskachalupa-pages');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

cpSync('site', dir, { recursive: true, filter: (src) => !src.endsWith('.extra-urls') });
run('npx', ['vite', 'build', `--base=${BASE}prohlidka/`, '--outDir', join(dir, 'prohlidka'), '--emptyOutDir']);
writeFileSync(join(dir, '.nojekyll'), '');

const remote = out('git', ['remote', 'get-url', 'origin']);
const name = out('git', ['config', 'user.name']);
const email = out('git', ['config', 'user.email']);
run('git', ['init', '-q', '-b', 'gh-pages'], dir);
run('git', ['-c', 'core.autocrlf=false', 'add', '-A'], dir);
run('git', ['-c', `user.name=${name}`, '-c', `user.email=${email}`, 'commit', '-qm', 'deploy: preview site and house tour'], dir);
run('git', ['push', '-qf', remote, 'gh-pages'], dir);
console.log('Deployed. GitHub Pages updates within a minute or two.');
