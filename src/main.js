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
  const host = btn.closest('.wrap, .card') || btn.parentElement;
  let noteEl = host.querySelector('.note.live');
  if (!noteEl) {
    noteEl = document.createElement('div');
    noteEl.className = 'note live';
    host.appendChild(noteEl);
  }
  noteEl.className = 'note live';
  noteEl.innerHTML = '<span class="spin"></span> &nbsp;Submitting, then waiting for consensus…';
  try {
    const hash = await fn();
    noteEl.className = 'note live ok';
    noteEl.innerHTML = `${esc(okMsg)}<br><span class="mono addr">${esc(hash)}</span><br>
      Validators settle in about a minute. Refresh the view then.`;
  } catch (err) {
    noteEl.className = 'note live err';
    noteEl.innerHTML = esc(err?.shortMessage || err?.message || String(err));
  }
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
    <p class="lede">Register something you own and state the licence in plain words. Those words are what
    every later review is judged against, so they are stored on chain exactly as written.</p>
    <div class="grid two">
      <div class="field"><label>Title</label><input id="w-title" placeholder="Inter typeface" /></div>
      <div class="field"><label>Licence fee, whole units</label><input id="w-fee" placeholder="5" /></div>
    </div>
    <div class="field"><label>Description</label>
      <textarea id="w-desc" placeholder="What the work is and how it is distributed."></textarea></div>
    <div class="field"><label>Licence terms</label>
      <textarea id="w-terms" placeholder="What is permitted, what is forbidden, what attribution is required."></textarea></div>
    <div class="row"><button class="act" id="w-go">Register work</button></div>
    <h3>Registered</h3>
    <div id="w-list"></div>`;

  el('w-go').onclick = (e) => action(e.target, () => write('register_work', [
    el('w-title').value, el('w-desc').value, el('w-terms').value, el('w-fee').value || '0',
  ]), 'Work submitted.');

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
      const gen = BigInt(Math.round(parseFloat(el(`rq-fee-${id}`).value || '0') * 1000)) * (GEN / 1000n);
      action(rq, () => write('request_licence', [id, el(`rq-use-${id}`).value, el(`rq-url-${id}`).value], gen),
        'Licence request submitted with the fee escrowed.');
    }
    if (rp) {
      const id = rp.dataset.rp;
      const gen = BigInt(Math.round(parseFloat(el(`rp-bond-${id}`).value || '0') * 1000)) * (GEN / 1000n);
      action(rp, () => write('report_infringement', [id, el(`rp-url-${id}`).value, el(`rp-note-${id}`).value], gen),
        'Report filed with the bond posted.');
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
      action(ev.target, () => write(fn, [id, el(`arg-${id}`).value, el(`ev-${id}`).value]), 'Submitted for a fresh round.');
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
    el('view').innerHTML = `<h2>Something went wrong</h2>
      <div class="note err">${esc(err?.shortMessage || err?.message || String(err))}</div>`;
  }
}

shell();
render();
