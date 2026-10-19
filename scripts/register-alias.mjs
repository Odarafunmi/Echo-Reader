// Registers the "@/" alias resolver for the whole process:
//   node --import ./scripts/register-alias.mjs scripts/check-accounts.mjs
import { register } from 'node:module';

register('./alias-loader.mjs', import.meta.url);
