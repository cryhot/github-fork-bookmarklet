# AGENTS.md

Collection of bookmarklets, see [`README.md`](README.md).


## Syncing README and scripts

The bookmarklet scripts (the `*.js` files at the root) are the ground truth.
Each `js` snippet of [`README.md`](README.md) (the one followed by a "Raw script in ..." line) is the content of its script, prefixed with `javascript:` (the `.js` files do not have this prefix).
Never edit a snippet by hand: edit the script, then run `node scripts/sync-readme.mjs` ([`scripts/sync-readme.mjs`](scripts/sync-readme.mjs)).
It is also run by the [`.githooks/pre-commit`](.githooks/pre-commit) hook (enable it with `git config core.hooksPath .githooks`),
and checked in CI by [`.github/workflows/check-readme-sync.yml`](.github/workflows/check-readme-sync.yml).

The options of a bookmarklet (default parameters on the first line of its script) are documented only in the README, not in the script.
They are default parameters of the main function rather than top-level `const`,
so they are on the first line without leaking into the page's global scope
(a top-level `const` would throw on the second click of the bookmark, as it can't be declared twice).


## Newlines

Bookmark managers may flatten the newlines of the script, so it must still work as a single line:
- No inline comments (`//`), as they would comment out the rest of the script.
  Use `/* */` instead.
- End every statement with `;`, never rely on automatic semicolon insertion.
- No multi-line string or template literal.
- No `%` sequences, which may be URL-decoded.


## Testing

Test in a browser on a real repository (eg. paste the script without `javascript:` in the console).
Mind the rate limits of the APIs the script calls: keep any limiting option low when testing.
