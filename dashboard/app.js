// Token Radar: the board, a detail view per protocol, the live-token set, and the model, rendered
// from window.RADAR (../data.js, written by main.ts from the same board board.json hands in).
// No framework, no fetch, no network: the page works from its files alone. The view lives in the
// hash (#/, #/live, #/model, #/p/<slug>, #/?cat=..&chain=..&q=..&watch=1&sort=..&dir=..), so a
// filtered or detail view is a link, and the back button walks the reader's own path.

const R = window.RADAR;
const app = document.getElementById('app');
const statsEl = document.getElementById('stats');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const commas = (v) => Math.round(v).toLocaleString('en-US');
function money(v) {
  if (v === null || v === undefined) return '—';
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${commas(v)}`;
}
const pct = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(1)}%`);
const pctClass = (v) => (v === null || v === undefined || v === 0 ? '' : v > 0 ? 'pos' : 'neg');
function ageText(days) {
  if (days === null || days === undefined) return 'unknown';
  if (days < 365) return `${days}d`;
  return `${(days / 365).toFixed(1)} yrs`;
}
const bySlug = new Map(R.rows.map((r) => [r.slug, r]));

/* ---------- header ---------- */
function renderStats() {
  const cells = [
    [R.protocols_size, 'protocols scanned'],
    [R.watchlist_size, 'watchlist covered'],
    [R.board_size, 'ranked pre-token'],
    [R.early_size, 'early finds'],
    [R.live_size, 'live tokens tracked'],
  ];
  statsEl.innerHTML = cells.map(([v, label]) => `<div class="stat"><b>${v}</b><span>${label}</span></div>`).join('');
  document.getElementById('source-line').textContent =
    `Data: ${R.source}. Snapshot date ${R.as_of}; watchlist floor ${money(R.floor_usd)} of TVL. Model ${R.model_version}, run over the sealed snapshot's own figures only.`;
}
function setTab(name) {
  for (const a of document.querySelectorAll('.tabs a')) a.classList.toggle('on', a.dataset.tab === name);
}

/* ---------- board ---------- */
const SORTS = {
  rank: { label: 'Rank', num: true },
  name: { label: 'Protocol', num: false },
  tvl: { label: 'TVL', num: true },
  change: { label: '7d', num: true },
  age: { label: 'Age', num: true },
  implied: { label: 'Implied value', num: true },
};
function sortValue(row, key) {
  if (key === 'rank') return row.rank;
  if (key === 'name') return row.name.toLowerCase();
  if (key === 'tvl') return row.tvl_usd;
  if (key === 'change') return row.change_7d;
  if (key === 'age') return row.age_days;
  return row.implied_value_usd;
}
function boardState(params) {
  return {
    q: params.get('q') ?? '',
    cat: params.get('cat') ?? '',
    chain: params.get('chain') ?? '',
    watch: params.get('watch') === '1',
    sort: SORTS[params.get('sort')] ? params.get('sort') : 'rank',
    dir: params.get('dir') === 'asc' ? 'asc' : params.get('sort') ? params.get('dir') || 'desc' : 'asc',
  };
}
function stateHash(st) {
  const p = new URLSearchParams();
  if (st.q) p.set('q', st.q);
  if (st.cat) p.set('cat', st.cat);
  if (st.chain) p.set('chain', st.chain);
  if (st.watch) p.set('watch', '1');
  if (st.sort !== 'rank') p.set('sort', st.sort);
  if (st.dir !== 'asc') p.set('dir', st.dir);
  const s = p.toString();
  return s ? `#/?${s}` : '#/';
}
function filteredRows(st) {
  const q = st.q.trim().toLowerCase();
  let rows = R.rows.filter((r) => {
    if (st.watch && !r.on_watchlist) return false;
    if (st.cat && r.category !== st.cat) return false;
    if (st.chain && !r.chains.includes(st.chain)) return false;
    if (q && !r.name.toLowerCase().includes(q) && !r.slug.includes(q)) return false;
    return true;
  });
  const mul = st.dir === 'asc' ? 1 : -1;
  rows = [...rows].sort((a, b) => {
    const va = sortValue(a, st.sort);
    const vb = sortValue(b, st.sort);
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    if (va < vb) return -1 * mul;
    if (va > vb) return 1 * mul;
    return a.rank - b.rank;
  });
  return rows;
}
function options(values, current, allLabel) {
  return [`<option value="">${allLabel}</option>`, ...values.map((v) => `<option value="${esc(v)}"${v === current ? ' selected' : ''}>${esc(v)}</option>`)].join('');
}
function renderBoard(params) {
  setTab('board');
  const st = boardState(params);
  const cats = [...new Set(R.rows.map((r) => r.category).filter(Boolean))].sort();
  const chainCount = new Map();
  for (const r of R.rows) for (const c of r.chains) chainCount.set(c, (chainCount.get(c) ?? 0) + 1);
  const chains = [...chainCount.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([c]) => c);
  const rows = filteredRows(st);
  const maxImplied = R.rows[0]?.implied_value_usd ?? 1;
  const head = Object.entries(SORTS)
    .map(([key, s]) => {
      const arrow = st.sort === key ? ` <span class="dir">${st.dir === 'asc' ? '▲' : '▼'}</span>` : '';
      return `<th class="sortable${s.num ? ' n' : ''}" data-sort="${key}">${s.label}${arrow}</th>`;
    })
    .join('');
  const body = rows
    .map((r) => {
      const badge = r.on_watchlist ? '<span class="badge watch">watchlist</span>' : '<span class="badge early">early</span>';
      const share = Math.max(2, Math.round((r.implied_value_usd / maxImplied) * 100));
      return `<tr data-slug="${esc(r.slug)}">
        <td class="rank">${r.rank}</td>
        <td><span class="pname">${esc(r.name)}</span>${badge}<br><span class="pcat">${esc(r.category ?? 'Uncategorised')}</span></td>
        <td class="chains">${esc(r.chains.slice(0, 3).join(', '))}${r.chains.length > 3 ? ` +${r.chains.length - 3}` : ''}</td>
        <td class="n">${money(r.tvl_usd)}</td>
        <td class="n ${pctClass(r.change_7d)}">${pct(r.change_7d)}</td>
        <td class="n">${ageText(r.age_days)}</td>
        <td class="n"><b>${money(r.implied_value_usd)}</b><span class="bar"><i style="width:${share}%"></i></span></td>
      </tr>`;
    })
    .join('');
  app.innerHTML = `
    <p class="lede">Every protocol on the snapshot's <b>watchlist</b> is here, ranked by the model's implied value — plus every
    pre-token launch candidate the radar found <b>below the ${money(R.floor_usd)} floor</b> (${R.early_size} early finds), because a launch
    worth farming rarely waits to be large. Click a row for its value math and its farm plan.</p>
    <div class="panel controls">
      <input type="search" id="f-q" placeholder="Search name or slug…" value="${esc(st.q)}" aria-label="Search">
      <select id="f-cat" aria-label="Category">${options(cats, st.cat, 'All categories')}</select>
      <select id="f-chain" aria-label="Chain">${options(chains, st.chain, 'All chains')}</select>
      <label class="check"><input type="checkbox" id="f-watch"${st.watch ? ' checked' : ''}> Watchlist only</label>
      <button class="reset" id="f-reset" type="button">Reset</button>
      <span class="count">${rows.length} of ${R.board_size} shown</span>
    </div>
    <div class="panel board-wrap"><table>
      <thead><tr>${head}</tr></thead>
      <tbody>${body || `<tr><td colspan="7" class="empty">No protocol matches that filter. Loosen it — the radar is wider than one view.</td></tr>`}</tbody>
    </table></div>`;
  app.setAttribute('aria-busy', 'false');
  const update = (patch) => {
    const next = { ...st, ...patch };
    history.replaceState(null, '', stateHash(next));
    renderBoard(new URLSearchParams(stateHash(next).split('?')[1] ?? ''));
  };
  let timer = null;
  document.getElementById('f-q').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => update({ q: e.target.value }), 160);
  });
  document.getElementById('f-cat').addEventListener('change', (e) => update({ cat: e.target.value }));
  document.getElementById('f-chain').addEventListener('change', (e) => update({ chain: e.target.value }));
  document.getElementById('f-watch').addEventListener('change', (e) => update({ watch: e.target.checked }));
  document.getElementById('f-reset').addEventListener('click', () => {
    history.replaceState(null, '', '#/');
    renderBoard(new URLSearchParams());
  });
  for (const th of app.querySelectorAll('th.sortable')) {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      update({ sort: key, dir: st.sort === key && st.dir === 'desc' ? 'asc' : st.sort === key ? 'asc' : SORTS[key].num ? 'desc' : 'asc' });
    });
  }
  for (const tr of app.querySelectorAll('tbody tr[data-slug]')) {
    tr.addEventListener('click', () => {
      location.hash = `#/p/${tr.dataset.slug}`;
    });
  }
}

/* ---------- detail ---------- */
function splitStep(s) {
  const at = s.indexOf(' Cost: ');
  if (at < 0) return { text: s, cost: null, time: null };
  const text = s.slice(0, at);
  const rest = s.slice(at + ' Cost: '.length);
  const tAt = rest.lastIndexOf('. Time: ');
  if (tAt < 0) return { text, cost: rest.replace(/\.$/, ''), time: null };
  return { text, cost: rest.slice(0, tAt), time: rest.slice(tAt + '. Time: '.length).replace(/\.$/, '') };
}
function renderDetail(slug) {
  setTab('board');
  const r = bySlug.get(slug);
  if (!r) {
    app.innerHTML = `<p class="lede">No protocol with the slug <b>${esc(slug)}</b> is on the board.</p><p><a class="back" href="#/">← Back to the board</a></p>`;
    return;
  }
  const m = r.model;
  const base = r.tvl_usd * m.category_multiple;
  const afterGrowth = base * m.growth_multiplier;
  const afterMaturity = afterGrowth * m.maturity_multiplier;
  const reachLine =
    m.reach_multiplier !== undefined
      ? `<tr><td>× reach, ${r.chains.length} chain${r.chains.length === 1 ? '' : 's'} of distribution</td><td class="n">× ${m.reach_multiplier.toFixed(4)}</td><td class="n">${money(afterMaturity * m.reach_multiplier)}</td></tr>`
      : '';
  const prev = R.rows[r.rank - 2];
  const next = R.rows[r.rank];
  const why = [
    `<b>${esc(r.name)}</b> holds rank ${r.rank} of ${R.board_size}: ${money(r.tvl_usd)} of TVL in ${esc(r.category ?? 'its category')} at the category rate ×${m.category_multiple}`,
    `a seven-day move of ${pct(r.change_7d)} worth ×${m.growth_multiplier.toFixed(2)}, and ${r.age_days === null ? 'an unrecorded listing day, scored as a year' : `${r.age_days} days of token-free history`} worth ×${m.maturity_multiplier.toFixed(2)}`,
    prev ? `put it behind <b>${esc(prev.name)}</b> (${money(prev.implied_value_usd)})` : 'put it at the head of the board',
    next ? `and ahead of <b>${esc(next.name)}</b> (${money(next.implied_value_usd)}).` : 'with nothing below it left to pass.',
  ].join(' ');
  const plan = r.farm_steps
    .map((s) => {
      const p = splitStep(s);
      const chips = [p.cost ? `<span class="chip">Cost: ${esc(p.cost)}</span>` : '', p.time ? `<span class="chip time">Time: ${esc(p.time)}</span>` : ''].join('');
      return `<li><span class="step-text">${esc(p.text)}</span><span class="chips">${chips}</span></li>`;
    })
    .join('');
  app.innerHTML = `
    <a class="back" href="#/">← Back to the board</a>
    <div class="detail-head">
      <div>
        <h2>${esc(r.name)} ${r.on_watchlist ? '<span class="badge watch">watchlist</span>' : '<span class="badge early">early find</span>'}</h2>
        <p class="sub">${esc(r.category ?? 'Uncategorised')} · ${esc(r.chains.join(', ') || 'no chains recorded')} · records no token</p>
      </div>
      <div class="tile" style="min-width:190px"><span>Implied value</span><b style="color:var(--signal)">${money(r.implied_value_usd)}</b></div>
    </div>
    <div class="tiles">
      <div class="tile"><span>Rank</span><b>#${r.rank}</b></div>
      <div class="tile"><span>TVL</span><b>${money(r.tvl_usd)}</b></div>
      <div class="tile"><span>7-day TVL change</span><b class="${pctClass(r.change_7d)}">${pct(r.change_7d)}</b></div>
      <div class="tile"><span>Token-free age</span><b>${ageText(r.age_days)}</b></div>
      <div class="tile"><span>Tracked since</span><b>${esc(r.listed_at ?? '—')}</b></div>
      <div class="tile"><span>Farm capital</span><b>$${commas(r.farm_capital_usd)}</b></div>
    </div>
    <div class="cols">
      <section class="panel box">
        <h3>Why this value</h3>
        <table class="math"><tbody>
          <tr><td>TVL × category rate (${esc(r.category ?? 'default')} ×${m.category_multiple})</td><td class="n"></td><td class="n">${money(base)}</td></tr>
          <tr><td>× growth, seven-day TVL ${pct(m.growth_pct)}</td><td class="n">× ${m.growth_multiplier.toFixed(4)}</td><td class="n">${money(afterGrowth)}</td></tr>
          <tr><td>× maturity, ${r.age_days === null ? 'age unrecorded' : `${r.age_days} days`} with no token</td><td class="n">× ${m.maturity_multiplier.toFixed(4)}</td><td class="n">${money(afterMaturity)}</td></tr>
          ${reachLine}
          <tr class="total"><td>Implied value if it launched at this record</td><td class="n"></td><td class="n">${money(r.implied_value_usd)}</td></tr>
        </tbody></table>
        <p class="why">${why}</p>
      </section>
      <section class="panel box">
        <h3>How to farm it</h3>
        <ol class="plan">${plan}</ol>
      </section>
    </div>`;
  app.setAttribute('aria-busy', 'false');
}

/* ---------- live tokens ---------- */
function renderLive() {
  setTab('live');
  const body = R.live
    .map(
      (p, i) => `<tr data-live="${esc(p.slug)}">
        <td class="rank">${i + 1}</td>
        <td><span class="pname">${esc(p.name)}</span> <span class="pcat">${esc(p.symbol ?? '')}</span><br><span class="pcat">${esc(p.category ?? 'Uncategorised')}</span></td>
        <td class="chains">${esc(p.chains.slice(0, 3).join(', '))}${p.chains.length > 3 ? ` +${p.chains.length - 3}` : ''}</td>
        <td class="n">${money(p.tvl_usd)}</td>
        <td class="n">${money(p.mcap_usd)}</td>
        <td class="n ${pctClass(p.change_7d)}">${pct(p.change_7d)}</td>
      </tr>`,
    )
    .join('');
  app.innerHTML = `
    <p class="lede">These protocols' tokens <b>already trade</b>, so the radar does not rank them: the market has already priced them,
    and the board's implied values would only echo it. They are kept here, at the market's own figures, as the scale the pre-token
    board is measured against — and as proof of the separation: nothing with a live token takes a ranked row.</p>
    <div class="panel board-wrap"><table>
      <thead><tr><th>#</th><th>Protocol</th><th>Chains</th><th class="n">TVL</th><th class="n">Market cap</th><th class="n">7d</th></tr></thead>
      <tbody>${body}</tbody>
    </table></div>`;
  app.setAttribute('aria-busy', 'false');
}

/* ---------- the model ---------- */
function renderModel() {
  setTab('model');
  const m = R.model;
  const multiples = Object.entries(m.category_multiples)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<div><span>${esc(k)}</span><span>× ${v}</span></div>`)
    .join('');
  const reach = m.reach_per_chain !== undefined ? `<li><b>Reach:</b> +${Math.round(m.reach_per_chain * 100)}% per chain beyond the first, up to ${m.reach_max_chains} extra chains — a launch distributed on seven chains starts with seven audiences.</li>` : '';
  app.innerHTML = `
    <section class="panel model-sec">
      <h3>One formula, every row</h3>
      <p class="formula">implied value = TVL × category rate × growth × maturity${m.reach_per_chain !== undefined ? ' × reach' : ''}</p>
      <p>No protocol is named anywhere in the model. The same function scores a $5M lending market and a $2B curator,
      from the snapshot's own figures alone, so a protocol that does not exist yet is scored the day the snapshot records it.</p>
    </section>
    <section class="panel model-sec">
      <h3>The four factors</h3>
      <ul>
        <li><b>Category rate:</b> what a dollar of TVL in the category has historically been worth in token value — fee-capturing trading and lending at the top, pass-through wrappers and bridges at the bottom.</li>
        <li><b>Growth:</b> the seven-day TVL change, clamped to ${m.growth_floor}%…+${m.growth_cap}%, weighted ×${m.growth_weight}: a protocol that doubled in a week is worth 1.6× its base; one that halved, 0.7×.</li>
        <li><b>Maturity:</b> ${m.maturity_floor} + ${m.maturity_range} × age / ${m.maturity_days} days: the longer a protocol has run with no token, the more of its record a launch can be priced on. An unrecorded listing day scores as ${m.unknown_age_days} days.</li>
        ${reach}
      </ul>
    </section>
    <section class="panel model-sec">
      <h3>Category rates</h3>
      <div class="kv">${multiples}<div><span>Every other category</span><span>× ${m.default_multiple}</span></div></div>
    </section>
    <section class="panel model-sec">
      <h3>Who gets on the board</h3>
      <ul>
        <li><b>The watchlist is the floor:</b> all ${R.watchlist_size} of the snapshot's watchlist protocols (TVL at or above ${money(R.floor_usd)}, no token recorded, no wrapped or staked product) are ranked, whatever the model says.</li>
        <li><b>Early finds:</b> below the floor, every protocol that records no token and passes the watchlist rule's own product tests — no versioned pool names, no wrapped or staked products, no exchange-issued products — is ranked too: ${R.early_size} of them. The radar carries all of them rather than a sample, so it cannot miss the one that launches next.</li>
        <li><b>Live tokens are separated:</b> a protocol whose token already trades never takes a ranked row; the Live tokens view shows it at the market's own value.</li>
        <li><b>A record, not a proof:</b> "records no token" is what DefiLlama's record says. The board says exactly that, and nothing stronger.</li>
      </ul>
    </section>`;
  app.setAttribute('aria-busy', 'false');
}

/* ---------- router ---------- */
function route() {
  const hash = location.hash || '#/';
  const [path, query] = hash.slice(1).split('?');
  const params = new URLSearchParams(query ?? '');
  window.scrollTo(0, 0);
  if (path === '/live') return renderLive();
  if (path === '/model') return renderModel();
  if (path.startsWith('/p/')) return renderDetail(decodeURIComponent(path.slice(3)));
  return renderBoard(params);
}
window.addEventListener('hashchange', route);
renderStats();
route();
