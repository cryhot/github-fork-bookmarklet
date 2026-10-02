/* Sync the `js` blocks of README.md with the bookmarklet scripts (the scripts are the ground truth).
   A block is the one directly followed by a line "Raw script in [`<file>`](<file>)."
   Usage: node scripts/sync-readme.mjs [--check] */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readmePath = join(root, 'README.md');
const readme = readFileSync(readmePath, 'utf8');
const pattern = /```js\n[\s\S]*?\n```\n(Raw script in \[`([^`]+)`\]\([^)]*\)\.)/g;

let count = 0;
const synced = readme.replace(pattern, (_, footer, file) => {
    count++;
    const script = readFileSync(join(root, file), 'utf8').replace(/\n$/, '');
    return `\`\`\`js\njavascript:${script}\n\`\`\`\n${footer}`;
});

if (count === 0) {
    console.error('No `js` block followed by "Raw script in ..." found in README.md.');
    process.exit(1);
}
if (synced === readme) {
    console.log(`README.md is in sync (${count} blocks).`);
} else if (process.argv.includes('--check')) {
    console.error('README.md is out of sync with the scripts. Run: node scripts/sync-readme.mjs');
    process.exit(1);
} else {
    writeFileSync(readmePath, synced);
    console.log('README.md updated.');
}
