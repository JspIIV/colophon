import './style.css';
import { CONTRACT, connect, currentAccount, read, write, GEN, toGen, shortAddr } from './chain.js';

const TABS = [
  ['overview', 'Overview'],
  ['works', 'Works'],
  ['requests', 'Licence requests'],
  ['reports', 'Infringement reports'],
  ['party', 'Standing'],
];

let tab = 'overview';
const el = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function verdictPill(v) {
  if (!v) return '<span class="pill">awaiting review</span>';
  const good = ['GRANTED', 'CONFIRMED'];
  const bad = ['REFUSED', 'UNFOUNDED'];
  const cls = good.includes(v) ? 'ok' : bad.includes(v) ? 'bad' : 'warn';
  return `<span class="pill ${cls}">${esc(v)}</span>`;
}

function shell() {
  document.querySelector('#app').innerHTML = `
    <header class="top">
      <div class="brand">
        <h1>Colophon</h1>
        <span class="tag">licence registry with adjudicated infringement review</span>
      </div>
      <div class="row">
        <span class="mono addr" id="net">studionet</span>
        <button class="act" id="connect">Connect wallet</button>
      </div>
    </header>
    <nav class="tabs" id="tabs"></nav>
    <main><div class="wrap" id="view"></div></main>
    <footer class="foot">
      Contract <span class="mono">${CONTRACT}</span> ·
      <a href="https://explorer-studio.genlayer.com/address/${CONTRACT}" target="_blank" rel="noreferrer">explorer</a>
    </footer>`;

  el('tabs').innerHTML = TABS.map(([k, label]) =>
    `<button data-tab="${k}" class="${k === tab ? 'active' : ''}">${label}</button>`).join('');
  el('tabs').onclick = (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    tab = t.dataset.tab;
    shell();
    render();
  };
  el('connect').onclick = async () => {
    try {
      const a = await connect();
      el('connect').textContent = shortAddr(a);
      el('connect').className = 'ghost';
      render();
    } catch (err) { alert(err.message); }
  };
  if (currentAccount()) {
    el('connect').textContent = shortAddr(currentAccount());
    el('connect').className = 'ghost';
  }
}

function busy(msg = 'Waiting for validator consensus on chain…') {
  return `<div class="note"><span class="spin"></span> &nbsp;${esc(msg)}</div>`;
}

async function action(btn, fn, okMsg) {
  // The note goes immediately after the row holding the button, not at the end
  // of the panel. Appending it to the panel put it below the list of works,
  // where a click looked like it had done nothing at all: the feedback existed
  // but was off screen.
  const anchor = btn.closest('.row') || btn;
  let noteEl = anchor.nextElementSibling;
  if (!noteEl || !noteEl.classList || !noteEl.classList.contains('live')) {
    noteEl = document.createElement('div');
    noteEl.className = 'note live';
    anchor.insertAdjacentElement('afterend', noteEl);
  }
  noteEl.className = 'note live';
  noteEl.innerHTML = '<span class="spin"></span> &nbsp;Submitting, then waiting for consensus…';
  noteEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  try {
    const hash = await fn();
    noteEl.className = 'note live ok';
    noteEl.innerHTML = `${esc(okMsg)}<br><span class="mono addr">${esc(hash)}</span><br>
      Validators settle in about a minute. Refresh the view then.`;
  } catch (err) {
    noteEl.className = 'note live err';
    const raw = String(err?.shortMessage || err?.message || err);
    noteEl.innerHTML = raw === 'Connect a wallet first.'
      ? 'Connect a wallet first, using the button at the top right. This action sends a transaction, so it has to be signed.'
      : esc(raw);
  }
  noteEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// Checked before anything is signed. An empty form used to sail straight into a
// transaction, which either wasted a signature on a refusal or wrote a campaign
// with no brand, no rules and nothing to judge against.
class FormError extends Error {}

function required(fields) {
  const missing = [];
  const out = {};
  for (const [id, label] of fields) {
    const raw = (el(id)?.value ?? '').trim();
    if (!raw) missing.push(label);
    out[id] = raw;
  }
  if (missing.length) {
    throw new FormError(missing.length === 1
      ? `${missing[0]} is required.`
      : `These are required: ${missing.join(', ')}.`);
  }
  return out;
}

function positiveNumber(id, label) {
  const raw = (el(id)?.value ?? '').trim();
  const n = Number(raw);
  if (!raw || !isFinite(n) || n <= 0) throw new FormError(`${label} must be a number greater than zero.`);
  return raw;
}

function httpUrl(id, label) {
  const raw = (el(id)?.value ?? '').trim();
  if (!raw) throw new FormError(`${label} is required.`);
  if (!/^https?:\/\/\S+\.\S+/i.test(raw)) {
    throw new FormError(`${label} must be a full URL starting with http, since validators have to fetch it.`);
  }
  return raw;
}

// Rendered at the top of any tab that can send a transaction, so the state is
// visible before a button is pressed rather than after.
function walletBanner() {
  if (currentAccount()) return '';
  if (typeof window.ethereum === 'undefined') {
    return `<div class="note err" style="margin-bottom:16px">
      No browser wallet detected. Reading this page needs nothing, but registering a work,
      requesting a licence or filing a report all send transactions and need a wallet such as
      MetaMask, connected to GenLayer Studionet.</div>`;
  }
  return `<div class="note" style="margin-bottom:16px">
    Wallet not connected. Use <strong>Connect wallet</strong> at the top right before
    sending anything from this page.</div>`;
}

// ----------------------------------------------------------------- overview

async function viewOverview() {
  el('view').innerHTML = `<h2>Overview</h2><p class="lede">Loading from chain…</p>${busy('Reading contract state')}`;
  const b = await read('get_frontend_bootstrap', []);
  const s = b.stats || {};
  el('view').innerHTML = `
    <h2>Overview</h2>
    <p class="lede">A creator registers a work with the licence they publish. Anyone can request a licence
    against escrowed value, or report a use they believe falls outside it against a bond. Every decision is
    made by GenLayer validators reading the cited page, and can be challenged and appealed.</p>
    <div class="stats">
      <div class="stat"><div class="n">${s.works ?? 0}</div><div class="k">works</div></div>
      <div class="stat"><div class="n">${s.licence_requests ?? 0}</div><div class="k">licence requests</div></div>
      <div class="stat"><div class="n">${s.infringement_reports ?? 0}</div><div class="k">reports</div></div>
      <div class="stat"><div class="n">${s.audit_entries ?? 0}</div><div class="k">audit entries</div></div>
    </div>
    <h3>Review rubric in force</h3>
    <div class="card"><div class="body">${esc(b.rubric || '')}</div></div>
    <h3>Recently registered works</h3>
    <div id="recent"></div>`;

  el('recent').innerHTML = (b.recent_works || []).length
    ? b.recent_works.map((w) => `
      <div class="card">
        <div class="head">
          <div>
            <div class="title">${esc(w.title)}</div>
            <div class="meta">owner <span class="mono addr">${esc(shortAddr(w.owner))}</span> ·
              fee ${esc(w.fee_units)} · ${esc(w.granted_count)} granted ·
              ${esc(w.confirmed_infringements)} confirmed infringements</div>
          </div>
          <span class="pill ${w.status === 'ACTIVE' ? 'ok' : ''}">${esc(w.status)}</span>
        </div>
        <div class="body">${esc(w.licence_terms)}</div>
      </div>`).join('')
    : '<div class="empty">No works registered yet.</div>';
}

// -------------------------------------------------------------------- works

async function viewWorks() {
  el('view').innerHTML = `<h2>Works</h2>${busy('Reading works')}`;
  const works = await read('get_recent_works', [50]);
  el('view').innerHTML = `
    <h2>Works</h2>
    ${walletBanner()}
    <p class="lede">Register something you own and state the licence in plain words. Those words are what
    every later review is judged against, so they are stored on chain exactly as written.</p>
    <div class="grid two">
      <div class="field"><label>Title</label><input id="w-title" placeholder="Inter typeface" /></div>
      <div class="field"><label>Licence fee in GEN, enforced exactly on every request</label><input id="w-fee" placeholder="2" /></div>
    </div>
    <div class="field"><label>Description</label>
      <textarea id="w-desc" placeholder="What the work is and how it is distributed."></textarea></div>
    <div class="field"><label>Licence terms</label>
      <textarea id="w-terms" placeholder="What is permitted, what is forbidden, what attribution is required."></textarea></div>
    <div class="row"><button class="act" id="w-go">Register work</button></div>
    <h3>Registered</h3>
    <div id="w-list"></div>`;

  el('w-go').onclick = (e) => action(e.target, () => {
    const f = required([
      ['w-title', 'Title'],
      ['w-desc', 'Description'],
      ['w-terms', 'Licence terms'],
    ]);
    if (f['w-terms'].length < 20) {
      throw new FormError('The licence terms are what every review is judged against, so they need to state something.');
    }
    const fee = positiveNumber('w-fee', 'Licence fee');
    return write('register_work', [f['w-title'], f['w-desc'], f['w-terms'], fee]);
  }, 'Work submitted.');

  el('w-list').innerHTML = works.length ? works.map((w) => `
    <div class="card">
      <div class="head">
        <div><div class="title">#${esc(w.id)} · ${esc(w.title)}</div>
          <div class="meta">owner <span class="mono addr">${esc(shortAddr(w.owner))}</span> · fee ${esc(w.fee_units)}</div></div>
        <span class="pill ${w.status === 'ACTIVE' ? 'ok' : ''}">${esc(w.status)}</span>
      </div>
      <div class="body">${esc(w.licence_terms)}</div>
      <div class="grid two" style="margin-top:12px">
        <div>
          <label>Request a licence · intended use</label>
          <textarea id="rq-use-${w.id}" placeholder="What you intend to do with it."></textarea>
          <label>Your project URL</label>
          <input id="rq-url-${w.id}" placeholder="https://your-project.example" />
          <label>Fee to escrow, in GEN</label>
          <input id="rq-fee-${w.id}" placeholder="3" />
          <div class="row" style="margin-top:8px"><button class="act" data-rq="${w.id}">Request licence</button></div>
        </div>
        <div>
          <label>Report an infringement · what you saw</label>
          <textarea id="rp-note-${w.id}" placeholder="Where and how the work is being used outside the licence."></textarea>
          <label>URL of the use</label>
          <input id="rp-url-${w.id}" placeholder="https://page-using-the-work.example" />
          <label>Bond, in GEN, forfeited if unfounded</label>
          <input id="rp-bond-${w.id}" placeholder="1" />
          <div class="row" style="margin-top:8px"><button class="ghost" data-rp="${w.id}">File report</button></div>
        </div>
      </div>
    </div>`).join('') : '<div class="empty">Nothing registered yet.</div>';

  el('w-list').onclick = (e) => {
    const rq = e.target.closest('[data-rq]');
    const rp = e.target.closest('[data-rp]');
    if (rq) {
      const id = rq.dataset.rq;
      action(rq, () => {
        const { [`rq-use-${id}`]: use } = required([[`rq-use-${id}`, 'Intended use']]);
        const url = httpUrl(`rq-url-${id}`, 'Project URL');
        const fee = positiveNumber(`rq-fee-${id}`, 'Fee');
        const gen = BigInt(Math.round(parseFloat(fee) * 1000)) * (GEN / 1000n);
        return write('request_licence', [id, use, url], gen);
      }, 'Licence request submitted with the fee escrowed.');
    }
    if (rp) {
      const id = rp.dataset.rp;
      action(rp, () => {
        const url = httpUrl(`rp-url-${id}`, 'Allegedly infringing URL');
        const { [`rp-note-${id}`]: note } = required([[`rp-note-${id}`, 'Note']]);
        const bond = positiveNumber(`rp-bond-${id}`, 'Bond');
        const gen = BigInt(Math.round(parseFloat(bond) * 1000)) * (GEN / 1000n);
        return write('report_infringement', [id, url, note], gen);
      }, 'Report filed with the bond posted.');
    }
  };
}

// ------------------------------------------------------------ case rendering

function historyStages(h) {
  return (h || []).map((x) => `<span class="stage">${esc(x.stage)} → ${esc(x.verdict)}</span>`).join('');
}

function caseCard(kind, c) {
  const isReq = kind === 'request';
  const url = isReq ? c.use_url : c.infringing_url;
  const who = isReq ? c.requester : c.reporter;
  const escrowed = isReq ? c.escrow : c.bond;
  const pending = c.status === 'PENDING_REVIEW';
  const reviewed = c.status === 'REVIEWED';
  const challenged = c.status === 'CHALLENGED';
  return `
    <div class="card" data-id="${esc(c.id)}">
      <div class="head">
        <div>
          <div class="title">#${esc(c.id)} · work #${esc(c.work_id)} · ${isReq ? 'licence request' : 'infringement report'}</div>
          <div class="meta">${isReq ? 'requester' : 'reporter'} <span class="mono addr">${esc(shortAddr(who))}</span>
            · ${toGen(escrowed)} GEN ${isReq ? 'escrowed' : 'bonded'}
            · <a href="${esc(url)}" target="_blank" rel="noreferrer">cited page</a></div>
        </div>
        ${verdictPill(c.verdict)}
      </div>
      <div class="body">${esc(isReq ? c.intended_use : c.note)}</div>
      ${c.reasoning ? `<div class="note">${esc(c.reasoning)}</div>` : ''}
      <div class="stages">${historyStages(c.history)}
        <span class="stage">status ${esc(c.status)}</span>
        ${c.settled ? '<span class="stage">settled</span>' : ''}</div>
      <div class="row" style="margin-top:12px">
        ${pending ? `<button class="act" data-do="review">Run review</button>` : ''}
        ${(reviewed || challenged) ? `<button class="ghost" data-do="finalise">Finalise and settle</button>` : ''}
        ${reviewed ? `<button class="ghost" data-do="challenge">Challenge</button>` : ''}
        ${(isReq && challenged) ? `<button class="ghost" data-do="appeal">Appeal</button>` : ''}
      </div>
      <div class="hidden-form" id="form-${kind}-${esc(c.id)}"></div>
    </div>`;
}

function attachCaseHandlers(kind, container) {
  container.onclick = (e) => {
    const btn = e.target.closest('[data-do]');
    if (!btn) return;
    const card = btn.closest('.card');
    const id = card.dataset.id;
    const what = btn.dataset.do;
    const isReq = kind === 'request';

    if (what === 'review') {
      return action(btn, () => write(isReq ? 'review_request' : 'review_report', [id]), 'Review submitted.');
    }
    if (what === 'finalise') {
      return action(btn, () => write(isReq ? 'finalise_request' : 'finalise_report', [id]), 'Settling.');
    }
    const holder = el(`form-${kind}-${id}`);
    holder.innerHTML = `
      <div class="field" style="margin-top:12px"><label>Your argument</label>
        <textarea id="arg-${id}" placeholder="Why the last decision was wrong."></textarea></div>
      <div class="field"><label>Evidence URL the contract should fetch</label>
        <input id="ev-${id}" placeholder="https://…" /></div>
      <button class="act" id="send-${id}">Submit ${what}</button>`;
    el(`send-${id}`).onclick = (ev) => {
      const fn = what === 'challenge'
        ? (isReq ? 'challenge_request' : 'challenge_report')
        : 'appeal_request';
      action(ev.target, () => {
        const { [`arg-${id}`]: argument } = required([[`arg-${id}`, 'Your argument']]);
        const url = httpUrl(`ev-${id}`, 'Evidence URL');
        return write(fn, [id, argument, url]);
      }, 'Submitted for a fresh round.');
    };
  };
}

async function viewCases(kind) {
  const isReq = kind === 'request';
  const title = isReq ? 'Licence requests' : 'Infringement reports';
  el('view').innerHTML = `<h2>${title}</h2>${busy('Reading cases')}`;
  const statuses = isReq
    ? ['PENDING_REVIEW', 'REVIEWED', 'CHALLENGED', 'FINAL_GRANTED', 'FINAL_REFUSED', 'FINAL_UNCLEAR']
    : ['PENDING_REVIEW', 'REVIEWED', 'CHALLENGED', 'FINAL_CONFIRMED', 'FINAL_UNFOUNDED', 'FINAL_UNCLEAR'];
  const method = isReq ? 'get_requests_by_status' : 'get_reports_by_status';
  const groups = await Promise.all(statuses.map((s) => read(method, [s]).then((r) => [s, r || []])));

  el('view').innerHTML = `
    <h2>${title}</h2>
    ${walletBanner()}
    <p class="lede">${isReq
      ? 'A request escrows the fee. Validators read the project page and decide whether the described use sits inside the licence. Either side can challenge, and the appeal is final.'
      : 'A report posts a bond. Validators read the cited page and decide whether it really shows a use outside the licence. An unfounded report forfeits its bond to the work owner.'}</p>
    <div id="cases"></div>`;

  const host = el('cases');
  const any = groups.some(([, list]) => list.length);
  host.innerHTML = any ? groups.filter(([, l]) => l.length).map(([s, list]) => `
    <h3>${esc(s.replace(/_/g, ' ').toLowerCase())}</h3>
    ${list.map((c) => caseCard(kind, c)).join('')}`).join('')
    : '<div class="empty">Nothing here yet.</div>';
  attachCaseHandlers(kind, host);
}

// ------------------------------------------------------------------- party

async function viewParty() {
  const a = currentAccount() || '';
  el('view').innerHTML = `
    <h2>Standing</h2>
    <p class="lede">Reputation moves with outcomes: a granted licence lifts a requester, a refused one costs them,
    a confirmed report earns standing and an unfounded one costs more than it earns. Every item also carries an
    immutable audit trail.</p>
    <div class="field"><label>Address</label><input id="p-addr" value="${esc(a)}" placeholder="0x…" /></div>
    <div class="row"><button class="act" id="p-go">Look up</button></div>
    <div id="p-out"></div>`;
  el('p-go').onclick = async () => {
    const addr = el('p-addr').value.trim();
    if (!addr) return;
    el('p-out').innerHTML = busy('Reading standing');
    const d = await read('get_party_activity', [addr]);
    const r = d.reputation || {};
    el('p-out').innerHTML = `
      <div class="stats" style="margin-top:18px">
        <div class="stat"><div class="n">${r.score ?? 0}</div><div class="k">score</div></div>
        <div class="stat"><div class="n">${r.works ?? 0}</div><div class="k">works</div></div>
        <div class="stat"><div class="n">${r.licences_granted ?? 0}</div><div class="k">licences granted</div></div>
        <div class="stat"><div class="n">${r.reports_confirmed ?? 0}</div><div class="k">reports confirmed</div></div>
      </div>
      <h3>Audit trail</h3>
      <div class="field"><label>Item</label>
        <div class="row">
          <select id="a-kind" style="max-width:160px"><option>REQUEST</option><option>REPORT</option><option>WORK</option></select>
          <input id="a-id" placeholder="id" style="max-width:120px" />
          <button class="ghost" id="a-go">Show trail</button>
        </div></div>
      <div id="a-out"></div>`;
    el('a-go').onclick = async () => {
      el('a-out').innerHTML = busy('Reading trail');
      const trail = await read('get_audit_trail', [el('a-kind').value, el('a-id').value || '0']);
      el('a-out').innerHTML = (trail || []).length
        ? `<table class="audit">${trail.map((t) => `<tr>
            <td class="k">${esc(t.action)}</td>
            <td class="mono addr">${esc(shortAddr(t.actor))}</td>
            <td>${esc(t.detail)}</td>
            <td class="k">${esc(String(t.at).slice(0, 19).replace('T', ' '))}</td></tr>`).join('')}</table>`
        : '<div class="empty">No entries.</div>';
    };
  };
  if (a) el('p-go').click();
}

// -------------------------------------------------------------------- boot

async function render() {
  try {
    if (tab === 'overview') return await viewOverview();
    if (tab === 'works') return await viewWorks();
    if (tab === 'requests') return await viewCases('request');
    if (tab === 'reports') return await viewCases('report');
    if (tab === 'party') return await viewParty();
  } catch (err) {
    // Reads already retry a busy network before giving up, so anything landing
    // here is worth showing plainly, with a way to try again that does not
    // require reloading the page.
    el('view').innerHTML = `<h2>Could not load this view</h2>
      <div class="note err">${esc(err?.message || err?.shortMessage || String(err))}</div>
      <div class="row" style="margin-top:14px"><button class="act" id="retry">Try again</button></div>`;
    el('retry').onclick = () => render();
  }
}

shell();
render();
