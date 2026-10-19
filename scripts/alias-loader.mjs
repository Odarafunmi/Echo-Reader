// Resolves import specifiers the way tsconfig.json does ("@/*" and extensionless
// relative paths), so Node can load the app's own TypeScript modules directly.
// Used by scripts/register-alias.mjs.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('..', import.meta.url);
const CANDIDATES = ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts'];

const hasExtension = (specifier) => /\.[a-z]+$/i.test(specifier);

async function resolveFrom(base, context, next, original) {
  for (const suffix of CANDIDATES) {
    const url = new URL(base.href + suffix);
    if (existsSync(fileURLToPath(url))) return next(url.href, context);
  }
  throw new Error(`Cannot resolve ${original} from ${base.href}`);
}

export async function resolve(specifier, context, next) {
  // "@/lib/db" -> "<repo>/lib/db"
  if (specifier.startsWith('@/')) {
    return resolveFrom(new URL(specifier.slice(2), ROOT), context, next, specifier);
  }
  // "./credentials" inside a .ts file: the repo omits extensions, Node does not.
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !hasExtension(specifier)) {
    const parent = context.parentURL ? new URL(context.parentURL) : ROOT;
    return resolveFrom(new URL(specifier, parent), context, next, specifier);
  }
  return next(specifier, context);
}
