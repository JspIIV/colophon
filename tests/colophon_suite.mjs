// Regression suite for Colophon's payment and lifecycle rules.
//
// Written because a reviewer asked for them, and because the contract allowed
// every one of these before:
//   1. paying any amount above zero for a work with a published fee
//   2. settling straight after a round, denying the other side its next stage
//   3. reports stopping at CHALLENGE while requests had a third round
//   4. an UNCLEAR report forfeiting the bond as though it were UNFOUNDED
//   5. a refused payable call keeping the caller's value
//   6. value stranded in the contract with nothing owing it
//
// Run against a freshly deployed contract:
//   cd placard-app && COLOPHON_ADDR=0x... node ../scripts/colophon_suite.mjs
//
// A note on how refusals are asserted. A payable method must not raise, because
// raising keeps the caller's value while reverting the state change. A refusal
// therefore completes as a successful transaction that creates nothing and
// returns the money, and that is what is asserted. Asserting on an ERROR result
// would be asserting on the bug.
import { Wallet } from 'file:///C:/Users/ysfym/AppData/Roaming/npm/node_modules/genlayer/node_modules/ethers/lib.esm/index.js';
import { createClient, createAccount } from './node_modules/genlayer-js/dist/index.js';
import { studionet } from './node_modules/genlayer-js/dist/chains/index.js';
import fs from 'fs';

const ADDR = process.env.COLOPHON_ADDR;
const KS = String.raw`C:\Users\ysfym\.genlayer\keystores`;
const GEN = 10n ** 18n;
const FEE_GEN = 2n;
const OWNER_ADDR = '0x80519c53f10d731e4ff83a7d9acd69cf98da6258';
const OTHER_ADDR = '0x0b57877ec84d96b672cd47d8ea4424283fdb9f6c';

async function load(name, password) {
  const w = await Wallet.fromEncryptedJson(fs.readFileSync(`${KS}/${name}.json`, 'utf8'), password);
  return createClient({ chain: studionet, account: createAccount(w.privateKey) });
}
const reader = createClient({ chain: studionet });

// Studionet drops connections often enough that an unretried call turns a
// contract test into a network test. Only transport failures are retried; a
// refusal by the contract is a result and must reach the assertion.
function isTransport(e) {
  const s = String(e && (e.details || e.message) || e);
  return /fetch failed|ECONNRESET|socket|timeout|Unexpected token '<'|503|502|429|Rate limit|Server busy|execution slots|-32006|-32029/i.test(s);
}
async function retry(label, fn, attempts = 5) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try { return await fn(); } catch (e) {
      if (!isTransport(e)) throw e;
      last = e;
      console.log(`  ..    ${label}: transport error, retry ${i}/${attempts}`);
      await new Promise(r => setTimeout(r, 5000 * i));
    }
  }
  throw last;
}
async function read(fn, args = []) {
  const raw = await retry(`read ${fn}`, () => reader.readContract({ address: ADDR, functionName: fn, args }));
  try { return JSON.parse(raw); } catch { return raw; }
}
async function chainBalance(a) {
  const r = await fetch('https://studio.genlayer.com/api', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getBalance', params: [a, 'latest'], id: 1 }),
  });
  return BigInt((await r.json()).result);
}
let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}\n        ${detail}`); }
}
async function send(client, fn, args, value = 0n) {
  const hash = await retry(`send ${fn}`, () => client.writeContract({ address: ADDR, functionName: fn, args, value }));
  const r = await retry(`receipt ${fn}`, () =>
    client.waitForTransactionReceipt({ hash, status: 'FINALIZED', retries: 60, interval: 15000 }));
  const exec = String(r?.consensus_data?.leader_receipt?.[0]?.execution_result ?? '?');
  return { ok: !exec.toUpperCase().includes('ERROR'), exec };
}
async function mustAccept(name, client, fn, args, value = 0n) {
  const r = await send(client, fn, args, value);
  check(name, r.ok, `refused: ${r.exec}`);
  return r;
}
async function mustRefuse(name, client, fn, args, value = 0n) {
  const r = await send(client, fn, args, value);
  check(name, !r.ok, `succeeded but should have been refused (${r.exec})`);
}
async function mustRefund(name, client, fn, args, value, countField) {
  const before = { n: Number((await read('get_stats'))[countField]), c: await chainBalance(ADDR) };
  await send(client, fn, args, value);
  const after = { n: Number((await read('get_stats'))[countField]), c: await chainBalance(ADDR) };
  check(`${name}, creates no record`, after.n === before.n, `count ${before.n} to ${after.n}`);
  check(`${name}, keeps none of the value`, after.c === before.c, `contract moved by ${after.c - before.c} wei`);
}
async function waitOutWindow(kind, id) {
  const w = await read('get_settlement_window', [kind, id]);
  if (Number(w.seconds_remaining) > 0) {
    console.log(`  ..    waiting ${Number(w.seconds_remaining) + 10}s for the ${kind.toLowerCase()} window`);
    await new Promise(r => setTimeout(r, (Number(w.seconds_remaining) + 10) * 1000));
  }
  return w;
}

const owner = await load('padv', 'placard-test-adv-2026');
const other = await load('ppub', 'placard-test-pub-2026');

const LICENCE = 'Released under the SIL Open Font License. The fonts may be used, embedded and modified freely, including in commercial products. The fonts must not be sold on their own. Any modified version must stay under the same licence and must not carry the reserved name.';
const PROJECT = 'https://github.com/vercel/next.js';
const ALLEGED = 'https://en.wikipedia.org/wiki/SIL_Open_Font_License';

console.log('contract', ADDR);
let st = await read('get_stats');
console.log('stats   ', JSON.stringify(st));

console.log('\n--- setup ---');
if (Number(st.works) < 1) {
  await mustAccept('register a work with a 2 GEN fee', owner, 'register_work',
    ['Inter typeface', 'A variable typeface for user interfaces', LICENCE, String(FEE_GEN)]);
} else console.log('  skip  work already registered');

console.log('\n--- case 1: the registered fee is enforced to the wei ---');
await mustRefund('underpaying the fee', other, 'request_licence',
  ['0', 'Embed the webfont', PROJECT], 1n * GEN, 'licence_requests');
await mustRefund('overpaying the fee', other, 'request_licence',
  ['0', 'Embed the webfont', PROJECT], 3n * GEN, 'licence_requests');

st = await read('get_stats');
if (Number(st.licence_requests) < 1) {
  await mustAccept('paying exactly the fee is accepted', other, 'request_licence',
    ['0', 'Embed the webfont unmodified on a commercial product site, with attribution', PROJECT],
    FEE_GEN * GEN);
}
const req0 = await read('get_request', ['0']);
check('the escrow equals the published fee', BigInt(req0.escrow) === FEE_GEN * GEN, `got ${req0.escrow}`);

if (req0.status === 'PENDING_REVIEW') await mustAccept('review the request', other, 'review_request', ['0']);
console.log(`  ..    review verdict ${(await read('get_request', ['0'])).verdict}`);

console.log('\n--- case 2: the side a round went against keeps its next stage ---');
const win = await read('get_settlement_window', ['REQUEST', '0']);
console.log('  ..   ', JSON.stringify(win));
check('a settlement window is open', Number(win.seconds_remaining) > 0, JSON.stringify(win));
const favoured = win.open_to_next_stage === OWNER_ADDR ? other : owner;
await mustRefuse('the favoured side cannot settle inside the window', favoured, 'finalise_request', ['0']);
await waitOutWindow('REQUEST', '0');
check('the window reports itself closed',
  (await read('get_settlement_window', ['REQUEST', '0'])).anyone_may_settle === true, '');
await mustAccept('either side may settle once it closes', favoured, 'finalise_request', ['0']);
check('the request reached a final status',
  String((await read('get_request', ['0'])).status).startsWith('FINAL_'), '');

console.log('\n--- case 3: report parties and bond incentives ---');
await mustRefund('bonding the wrong amount', other, 'report_infringement',
  ['0', PROJECT, 'wrong bond'], 1n * GEN, 'infringement_reports');
await mustRefund('an owner reporting their own work', owner, 'report_infringement',
  ['0', PROJECT, 'self report'], FEE_GEN * GEN, 'infringement_reports');

st = await read('get_stats');
if (Number(st.infringement_reports) < 1) {
  await mustAccept('a report bonding exactly the fee is accepted', other, 'report_infringement',
    ['0', ALLEGED, 'This page redistributes the typeface as a standalone download without attribution'],
    FEE_GEN * GEN);
}
if ((await read('get_report', ['0'])).status === 'PENDING_REVIEW') {
  await mustAccept('review the report', other, 'review_report', ['0']);
}
console.log(`  ..    report verdict ${(await read('get_report', ['0'])).verdict}`);

console.log('\n--- case 4: a report runs the same three stages a request does ---');
if ((await read('get_report', ['0'])).status === 'REVIEWED') {
  await mustAccept('challenge the report', owner, 'challenge_report',
    ['0', 'The cited page is an article about the licence, not a redistribution of the work', PROJECT]);
}
const challenged = await read('get_report', ['0']);
check('the report reached CHALLENGED', challenged.status === 'CHALLENGED', `got ${challenged.status}`);

const beforeAppeal = { c: await chainBalance(ADDR), o: await chainBalance(OWNER_ADDR), r: await chainBalance(OTHER_ADDR) };
if (challenged.status === 'CHALLENGED') {
  await mustAccept('appeal the report, the stage that did not exist before', other, 'appeal_report',
    ['0', 'Asking the arbiter to look again at whether the work is actually redistributed there', ALLEGED]);
}
const appealed = await read('get_report', ['0']);
check('the appeal settled the report',
  String(appealed.status).startsWith('FINAL_') && appealed.settled === true,
  `status ${appealed.status} settled ${appealed.settled}`);
check('the report history carries three stages',
  Array.isArray(appealed.history) && appealed.history.length === 3,
  `history length ${appealed.history && appealed.history.length}`);

console.log('\n--- case 5: the bond settles by verdict, and UNCLEAR is neutral ---');
const afterAppeal = { c: await chainBalance(ADDR), o: await chainBalance(OWNER_ADDR), r: await chainBalance(OTHER_ADDR) };
const bond = FEE_GEN * GEN;
check('the contract released exactly the bond',
  beforeAppeal.c - afterAppeal.c === bond, `contract moved by ${afterAppeal.c - beforeAppeal.c}`);
if (appealed.verdict === 'UNFOUNDED') {
  check('an UNFOUNDED report forfeits the bond to the owner',
    afterAppeal.o - beforeAppeal.o === bond, `owner moved by ${afterAppeal.o - beforeAppeal.o}`);
} else {
  check('a CONFIRMED or UNCLEAR report returns the bond to the reporter',
    afterAppeal.r - beforeAppeal.r === bond, `reporter moved by ${afterAppeal.r - beforeAppeal.r}`);
  check('the owner receives nothing unless the report was UNFOUNDED',
    afterAppeal.o === beforeAppeal.o, `owner moved by ${afterAppeal.o - beforeAppeal.o}`);
  if (appealed.verdict === 'UNCLEAR') {
    check('an UNCLEAR report is not counted as unfounded',
      Number((await read('get_reputation', [OTHER_ADDR])).reports_unfounded) === 0, '');
  }
}

console.log('\n--- case 6: no value is stranded ---');
const stats = await read('get_stats');
let owed = 0n;
for (let i = 0; i < Number(stats.licence_requests); i++) {
  const r = await read('get_request', [String(i)]);
  if (!r.settled) owed += BigInt(r.escrow);
}
for (let i = 0; i < Number(stats.infringement_reports); i++) {
  const r = await read('get_report', [String(i)]);
  if (!r.settled) owed += BigInt(r.bond);
}
check('the real balance equals the unsettled escrow and bonds',
  (await chainBalance(ADDR)) === owed, `owed=${owed}`);

console.log(`\n${passed} passed, ${failed} failed`);
console.log('final stats', JSON.stringify(await read('get_stats')));
process.exit(failed === 0 ? 0 : 1);
