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
  addVoiceSample,
  claimLegacyVoiceData,
  claimUnownedBooks,
  deleteAllVoiceData,
  deleteProfile,
  getVoiceProfile,
  getBookMeta,
  getOwnedBookMeta,
  getProfile,
  getSettings,
  listAnnotationsForBooks,
  listBooks,
  listProfiles,
  listVoiceSamples,
  putAnnotation,
  putProfile,
  putSettings,
  saveBook,
  saveVoiceProfile,
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

// ---- Libraries are scoped to a profile ----

const book = (id, profileId, title) => ({
  id,
  profileId,
  title,
  author: '',
  format: 'txt',
  addedAt: 1,
  wordCount: 100,
  chapterCount: 1,
  coverColor: 0,
});

await check('each profile sees only its own books', async () => {
  await saveBook(book('a1', 'p1', 'Ada One'), { id: 'a1', chapters: [{ title: 'One', paragraphs: ['x'] }] });
  await saveBook(book('a2', 'p1', 'Ada Two'), { id: 'a2', chapters: [{ title: 'One', paragraphs: ['x'] }] });
  await saveBook(book('b1', 'p2', 'Grace One'), { id: 'b1', chapters: [{ title: 'One', paragraphs: ['x'] }] });
  const ada = (await listBooks('p1')).map((b) => b.id).sort();
  const grace = (await listBooks('p2')).map((b) => b.id).sort();
  assert.deepEqual(ada, ['a1', 'a2'], 'profile A saw the wrong shelf');
  assert.deepEqual(grace, ['b1'], 'profile B saw the wrong shelf');
  assert.deepEqual(await listBooks('nobody'), [], 'an unknown profile must see nothing');
});

await check('a book can only be opened by its owner', async () => {
  assert.equal((await getOwnedBookMeta('a1', 'p1')).title, 'Ada One');
  assert.equal(await getOwnedBookMeta('a1', 'p2'), undefined, 'another profile opened the book');
  assert.equal(await getOwnedBookMeta('missing', 'p1'), undefined);
});

await check('books saved before profiles existed are adopted by the signing-in profile', async () => {
  const orphan = book('old1', '', 'Old Book');
  await saveBook(orphan, { id: 'old1', chapters: [{ title: 'One', paragraphs: ['x'] }] });
  assert.deepEqual((await listBooks('p1')).map((b) => b.id), ['a1', 'a2'], 'an unowned book leaked into a shelf');
  const claimed = await claimUnownedBooks('p1');
  assert.equal(claimed, 1, 'the orphan was not claimed');
  assert.equal((await getBookMeta('old1')).profileId, 'p1');
  assert.ok((await listBooks('p1')).some((b) => b.id === 'old1'));
  // A second sign-in must not move it again.
  assert.equal(await claimUnownedBooks('p2'), 0);
  assert.equal((await getBookMeta('old1')).profileId, 'p1');
  assert.deepEqual((await listBooks('p2')).map((b) => b.id), ['b1']);
});

await check('notes are read per book, so another library cannot see them', async () => {
  const note = (id, bookId) => ({
    id,
    kind: 'note',
    bookId,
    chapter: 0,
    body: `note ${id}`,
    createdAt: 1,
    updatedAt: 1,
  });
  await putAnnotation(note('n1', 'a1'));
  await putAnnotation(note('n2', 'b1'));
  assert.deepEqual((await listAnnotationsForBooks(['a1'])).map((a) => a.id), ['n1']);
  assert.deepEqual((await listAnnotationsForBooks(['b1'])).map((a) => a.id), ['n2']);
  assert.deepEqual(await listAnnotationsForBooks([]), [], 'no books must mean no notes');
});

await check('voice recordings belong to one profile, not the browser', async () => {
  const clip = (id, profileId) => ({
    id,
    profileId,
    kind: 'script',
    label: id,
    seconds: 10,
    mimeType: 'audio/webm',
    blob: new Blob(['x']),
    createdAt: 1,
  });
  const voice = (id) => ({
    id,
    name: 'My Voice',
    consentAt: 1,
    consentVersion: 1,
    createdAt: 1,
    updatedAt: 1,
  });
  await saveVoiceProfile(voice('p1'));
  await addVoiceSample(clip('s1', 'p1'));
  assert.equal((await getVoiceProfile('p1')).id, 'p1');
  assert.equal(await getVoiceProfile('p2'), undefined, 'another profile saw this voice');
  assert.deepEqual((await listVoiceSamples('p1')).map((s) => s.id), ['s1']);
  assert.deepEqual(await listVoiceSamples('p2'), [], 'another profile saw these recordings');

  // Deleting one profile's voice leaves the other profile's alone.
  await saveVoiceProfile(voice('p2'));
  await addVoiceSample(clip('s2', 'p2'));
  await deleteAllVoiceData('p1');
  assert.equal(await getVoiceProfile('p1'), undefined);
  assert.deepEqual(await listVoiceSamples('p1'), []);
  assert.equal((await getVoiceProfile('p2')).id, 'p2');
  assert.deepEqual((await listVoiceSamples('p2')).map((s) => s.id), ['s2']);
});

await check('voice data saved before profiles existed is adopted once', async () => {
  // What the old build wrote: the fixed id 'me' and the fixed owner 'me'.
  await saveVoiceProfile({ id: 'me', name: 'My Voice', consentAt: 1, consentVersion: 1, createdAt: 1, updatedAt: 1 });
  await addVoiceSample({
    id: 'legacy-clip',
    profileId: 'me',
    kind: 'script',
    label: 'legacy',
    seconds: 10,
    mimeType: 'audio/webm',
    blob: new Blob(['x']),
    createdAt: 1,
  });
  // Profile p3 already has a voice, so it must not inherit the old one.
  await saveVoiceProfile({ id: 'p3', name: 'My Voice', consentAt: 1, consentVersion: 1, createdAt: 1, updatedAt: 1 });
  await claimLegacyVoiceData('p3');
  assert.deepEqual(await listVoiceSamples('p3'), [], 'a profile with its own voice inherited a stranger\'s');
  // A fresh profile adopts it, and only once.
  await claimLegacyVoiceData('p4');
  assert.equal((await getVoiceProfile('p4')).id, 'p4');
  assert.deepEqual((await listVoiceSamples('p4')).map((s) => s.id), ['legacy-clip']);
  await claimLegacyVoiceData('p5');
  assert.equal(await getVoiceProfile('p5'), undefined, 'the legacy voice was adopted twice');
});

console.log(`\n${passed} checks passed`);
