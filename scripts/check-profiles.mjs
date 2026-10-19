// Checks the local profile and settings storage end to end, against the real
// IndexedDB layer (lib/db.ts) running on a fake IndexedDB, so it needs no browser.
//
//   node --import ./scripts/register-alias.mjs scripts/check-profiles.mjs
//
// There is no authentication to test: no password is stored, hashed or checked.
// What matters is that profiles are created, listed, switched and removed
// correctly, and that the theme choice survives a reload.

import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import {
  deleteProfile,
  getProfile,
  getSettings,
  listProfiles,
  putProfile,
  putSettings,
  touchProfile,
} from '@/lib/db';

let passed = 0;
const check = async (name, fn) => {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
};

const make = (id, name, extra = {}) => ({
  id,
  name,
  email: '',
  createdAt: 1_000,
  lastUsedAt: 1_000,
  ...extra,
});

console.log('local profiles:');

await check('the database opens with the profile and settings stores', async () => {
  assert.deepEqual(await listProfiles(), [], 'a fresh browser should have no profiles');
  assert.equal(await getSettings(), undefined, 'a fresh browser should have no settings');
});

await check('a profile round-trips through storage unchanged', async () => {
  const profile = make('p1', 'Ada Lovelace', { email: 'ada@example.com', createdAt: 5, lastUsedAt: 1 });
  await putProfile(profile);
  assert.deepEqual(await getProfile('p1'), profile);
  assert.equal(await getProfile('nope'), undefined, 'an unknown id should not invent a profile');
});

await check('profiles are listed most recently used first', async () => {
  await putProfile(make('p2', 'Grace Hopper', { lastUsedAt: 30 }));
  await putProfile(make('p3', 'Alan Turing', { lastUsedAt: 20 }));
  await putProfile(make('p4', 'Katherine Johnson', { lastUsedAt: 10 }));
  const names = (await listProfiles()).map((p) => p.name);
  assert.deepEqual(names, ['Grace Hopper', 'Alan Turing', 'Katherine Johnson', 'Ada Lovelace']);
});

await check('touching a profile moves it to the top and keeps the rest of it intact', async () => {
  await touchProfile('p4', 99);
  const all = await listProfiles();
  assert.equal(all[0].id, 'p4', 'the touched profile did not move up');
  assert.equal(all[0].lastUsedAt, 99);
  assert.equal(all[0].name, 'Katherine Johnson', 'touching rewrote the profile');
  assert.equal(all[0].createdAt, 1_000, 'createdAt should not change');
  await touchProfile('missing', 99); // must not throw or create a row
  assert.equal(await getProfile('missing'), undefined);
});

await check('saving over an id updates rather than duplicates', async () => {
  await putProfile(make('p1', 'Ada King', { email: 'ada@analytical.engine' }));
  const all = await listProfiles();
  assert.equal(all.filter((p) => p.id === 'p1').length, 1, 'the profile was duplicated');
  const p1 = await getProfile('p1');
  assert.equal(p1.name, 'Ada King');
  assert.equal(p1.email, 'ada@analytical.engine');
});

await check('removing a profile leaves the others alone', async () => {
  await deleteProfile('p3');
  const ids = (await listProfiles()).map((p) => p.id);
  assert.ok(!ids.includes('p3'), 'the removed profile is still listed');
  assert.deepEqual(ids.sort(), ['p1', 'p2', 'p4']);
  await deleteProfile('p3'); // removing twice must be harmless
  assert.equal(await getProfile('p3'), undefined);
});

await check('the theme choice is stored and read back', async () => {
  await putSettings({ id: 'app', theme: 'light' });
  assert.deepEqual(await getSettings(), { id: 'app', theme: 'light' });
  await putSettings({ id: 'app', theme: 'dark' });
  assert.equal((await getSettings()).theme, 'dark');
  assert.equal((await listProfiles()).length, 3, 'saving settings disturbed the profiles');
});

console.log(`\n${passed} checks passed`);
