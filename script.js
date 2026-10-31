const $ = s => document.querySelector(s),
  $$ = s => [...document.querySelectorAll(s)];
const COLORS = ['#2f7d6b', '#b7893a', '#3f6fa3', '#b45a55', '#6c6aa6', '#4f8f8f', '#c27a3d', '#8a6a8f'];
const esc = s => String(s).replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[c]));
const money = c => (c / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
const toC = v => Math.round(parseFloat(v) * 100) || 0;
const dkey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
const ic = (n, s) => `<svg class="ic"${s ? ` style="width:${s}px;height:${s}px"` : ''}><use href="#i-${n}"/></svg>`;
let range = 30,
  prev = {},
  open = { inc: false, tx: false },
  shown = 0,
  CH = null,
  wishFilter = 'all';

function scale(a, t) {
  if (!a.length) return [];
  const s = a.reduce((x, y) => x + y, 0),
    raw = s ? a.map(x => x * t / s) : a.map(() => t / a.length),
    fl = raw.map(Math.floor);
  let rem = t - fl.reduce((x, y) => x + y, 0);
  raw.map((r, i) => [r - fl[i], i])
    .sort((x, y) => y[0] - x[0])
    .forEach(p => {
      if (rem > 0) {
        fl[p[1]]++;
        rem--;
      }
    });
  return fl;
}

function incomeTx(bs, total, desc, date) {
  const split = {};
  let used = 0;
  bs.forEach(b => {
    split[b.id] = Math.floor(total * b.pct / 100);
    used += split[b.id];
  });
  split[bs[0].id] += total - used;
  return { id: uid(), kind: 'income', date, desc, cents: total, split };
}

function seed() {
  return {
    buckets: [['Savings', 70], ['God', 5], ['Spending', 10], ['Family', 10], ['Business', 5]].map(([name, pct], i) => ({
      id: uid(),
      name,
      pct,
      color: COLORS[i]
    })),
    tx: [],
    wish: [],
    archived: []
  };
}

let S;
try {
  S = JSON.parse(localStorage.getItem('buckets-v1'));
} catch (e) {}
if (!S || !S.buckets) S = seed();
S.archived = S.archived || [];
S.tx = S.tx || [];
S.wish = (S.wish || []).map(w => ({ ...w, kind: w.kind || 'buy' }));
S.buckets.forEach((b, i) => {
  if (!COLORS.includes(b.color)) b.color = COLORS[i % COLORS.length];
});
if (S.buckets.reduce((a, b) => a + b.pct, 0) !== 100) {
  const sc = scale(S.buckets.map(b => b.pct), 100);
  S.buckets.forEach((b, i) => b.pct = sc[i]);
}
const save = () => {
  try {
    localStorage.setItem('buckets-v1', JSON.stringify(S));
  } catch (e) {}
};
const name = id => (S.buckets.concat(S.archived).find(b => b.id === id) || { name: 'Deleted' }).name;

function flows(id) {
  let inn = 0, out = 0;
  S.tx.forEach(t => {
    if (t.kind === 'income') inn += t.split[id] || 0;
    else if (t.kind === 'expense') {
      if (t.bucket === id) out += t.cents;
    } else {
      if (t.to === id) inn += t.cents;
      if (t.from === id) out += t.cents;
    }
  });
  return { inn, out, bal: inn - out };
}

const level = f => f.inn > 0 ? Math.max(0, Math.min(1, f.bal / f.inn)) : 0;

let tt;
function toast(m) {
  const t = $('#toast');
  t.textContent = m;
  t.classList.add('on');
  clearTimeout(tt);
  tt = setTimeout(() => t.classList.remove('on'), 2300);
}

function bucketSvg(b, lv) {
  const body = 'M14 34 L106 34 L96 122 Q60 134 24 122 Z',
    wv = 'q15 -6 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 V120 H-120Z';
  return `<svg class="bk" viewBox="0 0 120 140" aria-hidden="true"><defs><clipPath id="c${b.id}"><path d="${body}"/></clipPath><linearGradient id="s${b.id}"><stop offset="0" stop-color="#000" stop-opacity=".1"/><stop offset=".45" stop-color="#fff" stop-opacity=".14"/><stop offset="1" stop-color="#000" stop-opacity=".1"/></linearGradient></defs>
  <path d="${body}" fill="var(--empty)"/>
  <g clip-path="url(#c${b.id})"><g class="liq" style="transform:translateY(${130 - lv * 92}px)"><path class="wave2" d="M-120 -3 ${wv}" fill="${b.color}"/><path class="wave" d="M-120 0 ${wv}" fill="${b.color}"/></g></g>
  <path d="${body}" fill="url(#s${b.id})" stroke="var(--rim)" stroke-width="2.5" stroke-linejoin="round"/>
  <ellipse cx="60" cy="34" rx="46" ry="9" fill="none" stroke="var(--rim)" stroke-width="3"/></svg>`;
}

function setTotal(v) {
  const el = $('#total'), a = shown, t0 = performance.now();
  const step = t => {
    const p = Math.min(1, (t - t0) / 700), e = 1 - Math.pow(1 - p, 3);
    el.textContent = money(a + (v - a) * e);
    if (p < 1) requestAnimationFrame(step);
    else shown = v;
  };
  requestAnimationFrame(step);
}

function renderBuckets() {
  $('#buckets').innerHTML = S.buckets.map(b => {
    const f = flows(b.id);
    return `<article class="bucket" style="--c:${b.color}" data-id="${b.id}"><button class="edit" data-edit="${b.id}" aria-label="Edit ${esc(b.name)}">${ic('edit', 15)}</button>${bucketSvg(b, prev[b.id] ?? 0)}<div class="bt"><h3>${esc(b.name)}</h3><p class="amt">${money(f.bal)}</p><p class="sub">${b.pct}% of income</p></div></article>`;
  }).join('');
  const bs = S.buckets.map(b => ({ b, v: Math.max(0, flows(b.id).bal) })),
    tot = bs.reduce((a, x) => a + x.v, 0) || 1;
  $('#stack').innerHTML = bs.map(x => `<i style="background:${x.b.color};width:0" data-w="${x.v / tot * 100}" title="${esc(x.b.name)} ${money(x.v)}"></i>`).join('');
  $('#legend').innerHTML = bs.map(x => `<span><i style="background:${x.b.color}"></i>${esc(x.b.name)} ${Math.round(x.v / tot * 100)}%</span>`).join('');
  document.body.offsetWidth;
  S.buckets.forEach(b => {
    const lv = level(flows(b.id)),
      g = document.querySelector(`[data-id="${b.id}"] .liq`);
    if (g) g.style.transform = `translateY(${130 - lv * 92}px)`;
    prev[b.id] = lv;
  });
  $$('#stack i').forEach(i => i.style.width = i.dataset.w + '%');
  setTotal(S.buckets.reduce((a, b) => a + flows(b.id).bal, 0));
}

function fillSelects() {
  const o = S.buckets.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
  ['#xB', '#tF', '#tT', '#wB'].forEach(s => {
    const e = $(s), v = e.value;
    e.innerHTML = o;
    if (v && S.buckets.some(b => b.id === v)) e.value = v;
  });
  if ($('#tF').value === $('#tT').value && S.buckets.length > 1) $('#tT').selectedIndex = ($('#tF').selectedIndex + 1) % S.buckets.length;
}

function renderChart() {
  const el = $('#line'),
    W = Math.max(300, Math.round(el.getBoundingClientRect().width) || 560),
    H = 210,
    n = range,
    t = new Date();
  t.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(t);
    d.setDate(t.getDate() - i);
    days.push(dkey(d));
  }
  const m = {};
  days.forEach(k => m[k] = 0);
  S.tx.forEach(x => {
    if (x.kind === 'income' && x.date in m) m[x.date] += x.cents;
  });
  const v = days.map(k => m[k]),
    sum = v.reduce((a, c) => a + c, 0),
    mx = Math.max(...v),
    max = Math.max(mx, 100) * 1.1,
    L = 40,
    R = 12,
    T = 14,
    B = 28;
  const X = i => L + i * (W - L - R) / (n - 1),
    Y = c => H - B - (c / max) * (H - B - T);
  let d = `M${X(0)},${Y(v[0])}`;
  for (let i = 1; i < n; i++) {
    const mx2 = (X(i - 1) + X(i)) / 2;
    d += ` C${mx2},${Y(v[i - 1])} ${mx2},${Y(v[i])} ${X(i)},${Y(v[i])}`;
  }
  let g = '';
  [0, .5, 1].forEach(f => {
    const y = Y(max * f);
    g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="var(--line)"/><text x="${L - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${Math.round(max * f / 100)}</text>`;
  });
  let lab = '';
  for (let k = 0; k < 5; k++) {
    const i = Math.round(k * (n - 1) / 4);
    lab += `<text x="${X(i)}" y="${H - 8}" text-anchor="${k == 0 ? 'start' : k == 4 ? 'end' : 'middle'}" font-size="11" fill="var(--muted)">${days[i].slice(5)}</text>`;
  }
  const avg = sum / n;
  el.setAttribute('viewBox', `0 0 ${W} ${H}`);
  el.innerHTML = `<defs><linearGradient id="ag" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${T}" y2="${H - B}"><stop offset="0" stop-color="var(--accent)" stop-opacity=".18"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>${g}
  <path class="ar" d="${d} L${X(n - 1)},${Y(0)} L${X(0)},${Y(0)}Z" fill="url(#ag)"/>
  ${avg > 0 ? `<line x1="${L}" x2="${W - R}" y1="${Y(avg)}" y2="${Y(avg)}" stroke="var(--muted)" stroke-dasharray="4 4" opacity=".6"/><text x="${W - R}" y="${Y(avg) - 5}" text-anchor="end" font-size="10.5" fill="var(--muted)">avg ${money(avg)}</text>` : ''}
  <path class="ln" pathLength="1" d="${d}" fill="none" stroke="var(--accent)" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/>
  ${v.map((c, i) => c ? `<circle cx="${X(i)}" cy="${Y(c)}" r="3.5" fill="var(--card)" stroke="var(--accent)" stroke-width="2"/>` : '').join('')}${lab}
  ${sum === 0 ? `<text x="${W / 2}" y="${H / 2 - 6}" text-anchor="middle" font-size="13" fill="var(--muted)">No income in this period</text>` : ''}
  <g id="xh" style="display:none"><line id="xl" y1="${T}" y2="${H - B}" stroke="var(--muted)" stroke-dasharray="3 3"/><circle id="xc" r="5" fill="var(--accent)" stroke="var(--card)" stroke-width="2.5"/></g>`;
  CH = { W, n, X, Y, v, days, L, R };
  $('#rng').textContent = n;
  $('#stats').innerHTML = `<div class="stat"><b>${money(sum)}</b><span>Total</span></div><div class="stat"><b>${money(Math.round(avg))}</b><span>Daily avg</span></div><div class="stat"><b>${mx > 0 ? money(mx) : '–'}</b><span>Best day</span></div>`;
}

function hoverChart(e) {
  if (!CH) return;
  const el = $('#line'),
    r = el.getBoundingClientRect(),
    x = (e.clientX - r.left) * (CH.W / r.width);
  const i = Math.max(0, Math.min(CH.n - 1, Math.round((x - CH.L) / ((CH.W - CH.L - CH.R) / (CH.n - 1)))));
  $('#xh').style.display = '';
  $('#xl').setAttribute('x1', CH.X(i));
  $('#xl').setAttribute('x2', CH.X(i));
  $('#xc').setAttribute('cx', CH.X(i));
  $('#xc').setAttribute('cy', CH.Y(CH.v[i]));
  const tip = $('#tip');
  tip.textContent = CH.days[i].slice(5) + ' · ' + money(CH.v[i]);
  tip.style.left = Math.max(50, Math.min(r.width - 50, CH.X(i) * r.width / CH.W)) + 'px';
  tip.style.top = (CH.Y(CH.v[i]) * r.height / 210) + 'px';
  tip.style.opacity = 1;
}
$('#line').addEventListener('pointermove', hoverChart);
$('#line').addEventListener('pointerleave', () => {
  $('#tip').style.opacity = 0;
  const x = $('#xh');
  if (x) x.style.display = 'none';
});

const LAB = {
  buy: ['Buy', 'Purchased', 'cart'],
  send: ['Send', 'Sent', 'send'],
  do: ['Done', 'Marked done', 'flag']
};

const WISH_EMPTY = {
  all: 'Nothing on your wishlist yet.',
  buy: 'No buy items yet.',
  send: 'No send items yet.',
  do: 'No to-do items yet.'
};

function renderWish() {
  const items = wishFilter === 'all' ? S.wish : S.wish.filter(w => w.kind === wishFilter);
  $('#wish').innerHTML = items.length ? items.map(w => {
    const b = flows(w.bucket).bal,
      ok = b >= w.cents,
      p = w.cents ? Math.max(0, Math.min(100, b / w.cents * 100)) : 100,
      L = LAB[w.kind];
    return `<li><span class="av">${ic(L[2])}</span><div class="mid"><strong>${esc(w.name)}</strong><small>${w.cents ? money(w.cents) + ' from ' : 'From '}${esc(name(w.bucket))} · ${Math.round(p)}% funded</small><div class="bar ${ok ? 'ok' : ''}"><i data-w="${p}"></i></div></div>${ok ? `<button class="sm pri" data-act="${w.id}">${ic(w.kind === 'do' ? 'check' : L[2], 14)}${L[0]}</button>` : ''}<button class="ib" data-rm="${w.id}" aria-label="Remove">${ic('trash')}</button></li>`;
  }).join('') : `<li><span class="empty" style="width:100%">${WISH_EMPTY[wishFilter]}</span></li>`;
  document.body.offsetWidth;
  $$('#wish .bar i').forEach(i => i.style.width = i.dataset.w + '%');
}

function rowHtml(t) {
  const k = t.kind,
    icn = k === 'income' ? 'down' : k === 'expense' ? 'up' : 'swap',
    sub = k === 'transfer' ? `${esc(name(t.from))} → ${esc(name(t.to))}` : k === 'expense' ? esc(name(t.bucket)) : `Split across ${Object.values(t.split).filter(x => x > 0).length} buckets`,
    sign = k === 'income' ? '+' : k === 'expense' ? '−' : '';
  return `<li><span class="av ${k}">${ic(icn)}</span><div class="mid"><strong>${esc(t.desc)}</strong><small>${t.date} · ${sub}</small></div><span class="amt2 ${k === 'income' ? 'pos' : k === 'expense' ? 'neg' : ''}">${sign}${money(t.cents)}</span><button class="ib" data-del="${t.id}" aria-label="Delete entry">${ic('trash', 16)}</button></li>`;
}

function fillList(ul, wrap, btn, arr, isOpen, emptyMsg) {
  ul.innerHTML = arr.length ? (isOpen ? arr : arr.slice(0, 5)).map(rowHtml).join('') : `<li><span class="empty" style="width:100%">${emptyMsg}</span></li>`;
  wrap.className = isOpen ? 'scroll' : '';
  btn.hidden = arr.length <= 5;
  btn.classList.toggle('open', isOpen);
  btn.querySelector('span').textContent = isOpen ? 'Show less' : `Show more (${arr.length - 5})`;
}

function renderLists() {
  const all = S.tx.map((t, i) => [t, i]).sort((a, b) => b[0].date.localeCompare(a[0].date) || b[1] - a[1]).map(x => x[0]);
  fillList($('#inc'), $('#incw'), $('#moreI'), all.filter(t => t.kind === 'income'), open.inc, 'No income yet. Tap Add income to log a payment.');
  fillList($('#txs'), $('#txw'), $('#moreT'), all.filter(t => t.kind !== 'income'), open.tx, 'No spending or transfers yet.');
}

function renderAfford() {
  const p = toC($('#price').value);
  if (!p) {
    $('#afford').innerHTML = '<span class="sub">Enter a price to see which buckets can cover it.</span>';
    return;
  }
  const tot = S.buckets.reduce((a, b) => a + flows(b.id).bal, 0);
  $('#afford').innerHTML = S.buckets.map(b => {
    const bal = flows(b.id).bal;
    return `<div class="row" style="padding:5px 0;border-bottom:1px solid var(--line)"><span>${esc(b.name)}</span><span class="${bal >= p ? 'pos' : 'neg'}" style="display:inline-flex;align-items:center;gap:4px">${ic(bal >= p ? 'check' : 'x', 13)}${bal >= p ? 'Covers it' : 'Short ' + money(p - bal)}</span></div>`;
  }).join('') + `<div class="sub" style="margin-top:10px;display:flex;align-items:center;gap:5px">${ic(tot >= p ? 'check' : 'x', 13)}${tot >= p ? 'Your total balance covers it.' : 'Your total is short by ' + money(p - tot) + '.'}</div>`;
}

function render() {
  renderBuckets();
  fillSelects();
  renderChart();
  renderWish();
  renderLists();
  renderAfford();
  save();
}

/* money actions */
function spend(bucket, c, desc) {
  if (c <= 0) {
    toast('Enter an amount');
    return false;
  }
  if (flows(bucket).bal < c) {
    toast('Not enough in ' + name(bucket));
    return false;
  }
  S.tx.push({ id: uid(), kind: 'expense', date: dkey(new Date()), desc: desc || name(bucket), cents: c, bucket });
  return true;
}

$('#fE').onsubmit = e => {
  e.preventDefault();
  if (spend($('#xB').value, toC($('#xA').value), $('#xN').value.trim())) {
    e.target.reset();
    render();
    toast('Expense logged');
  }
};

$('#fT').onsubmit = e => {
  e.preventDefault();
  const f = $('#tF').value, t = $('#tT').value, c = toC($('#tA').value);
  if (f === t) return toast('Pick two different buckets');
  if (c <= 0) return toast('Enter an amount');
  if (flows(f).bal < c) return toast('Not enough in ' + name(f));
  S.tx.push({ id: uid(), kind: 'transfer', date: dkey(new Date()), desc: 'Transfer', cents: c, from: f, to: t });
  $('#tA').value = '';
  render();
  toast('Transferred');
};

$('#wN').oninput = e => {
  if (/^(send|give|gift|pay)\b/i.test(e.target.value)) $('#wK').value = 'send';
};

function setWishFilter(f) {
  wishFilter = f;
  $$('#wTabs button').forEach(b => b.classList.toggle('on', b.dataset.f === f));
}

$('#addW').onclick = () => {
  $('#fW').reset();
  $('#dW').showModal();
};

$('#wTabs').onclick = e => {
  const b = e.target.closest('button');
  if (!b) return;
  setWishFilter(b.dataset.f);
  renderWish();
};

$('#fW').onsubmit = e => {
  e.preventDefault();
  const k = $('#wK').value, c = toC($('#wP').value);
  if (k !== 'do' && c <= 0) return toast('Enter an amount');
  S.wish.push({ id: uid(), name: $('#wN').value.trim(), cents: c, bucket: $('#wB').value, kind: k });
  $('#fW').reset();
  $('#dW').close();
  setWishFilter('all');
  render();
};

$('#wish').onclick = e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.rm) S.wish = S.wish.filter(w => w.id !== b.dataset.rm);
  if (b.dataset.act) {
    const w = S.wish.find(x => x.id === b.dataset.act);
    if (w.cents > 0 && !spend(w.bucket, w.cents, w.name)) return;
    S.wish = S.wish.filter(x => x.id !== w.id);
    toast(LAB[w.kind][1]);
  }
  render();
};

document.addEventListener('click', e => {
  const b = e.target.closest('[data-del]');
  if (!b) return;
  const i = S.tx.findIndex(t => t.id === b.dataset.del);
  if (i < 0) return;
  const t = S.tx.splice(i, 1)[0];
  if (S.buckets.some(x => flows(x.id).bal < 0)) {
    S.tx.splice(i, 0, t);
    return toast('Cannot delete: that money was already spent');
  }
  render();
  toast('Entry deleted');
});

$('#moreI').onclick = () => {
  open.inc = !open.inc;
  renderLists();
};
$('#moreT').onclick = () => {
  open.tx = !open.tx;
  renderLists();
};
$('#price').oninput = renderAfford;

$('#atabs').onclick = e => {
  const b = e.target.closest('button');
  if (!b) return;
  $$('#atabs button').forEach(x => x.classList.toggle('on', x === b));
  ['fE', 'fT', 'pA'].forEach(id => $('#' + id).classList.remove('on'));
  $('#' + b.dataset.p).classList.add('on');
};

$('#rtabs').onclick = e => {
  const b = e.target.closest('button');
  if (!b) return;
  range = +b.dataset.r;
  $$('#rtabs button').forEach(x => x.classList.toggle('on', x === b));
  renderChart();
};

/* nav */
const TITLES = { home: 'Buckets', move: 'Move money', wish: 'Wishlist', act: 'Activity' };

function go(s) {
  document.body.dataset.screen = s;
  $('#ttl').textContent = TITLES[s];
  $$('.tab [data-go]').forEach(b => b.classList.toggle('on', b.dataset.go === s));
  window.scrollTo(0, 0);
  if (s === 'home') renderChart();
}
$$('.tab [data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
let rz;
window.addEventListener('resize', () => {
  clearTimeout(rz);
  rz = setTimeout(renderChart, 150);
});

/* income */
function openIncome() {
  $('#iErr').textContent = '';
  $('#fI').reset();
  $('#iD').value = dkey(new Date());
  $('#dI').showModal();
}
$('#addInc').onclick = openIncome;
$('#fab').onclick = openIncome;
$('#fI').onsubmit = e => {
  e.preventDefault();
  const c = toC($('#iA').value);
  if (c <= 0) return ($('#iErr').textContent = 'Enter an amount.');
  S.tx.push(incomeTx(S.buckets, c, $('#iS').value.trim(), $('#iD').value));
  $('#dI').close();
  render();
  toast('Income split across buckets');
};

/* bucket allocation dialog (new / edit / rebalance) */
let draft = [],
  focus = null,
  editingId = null;

function setPct(i, v) {
  draft[i].pct = v;
  const others = draft.filter((_, k) => k !== i),
    sc = scale(others.map(o => o.pct), 100 - v);
  others.forEach((o, k) => o.pct = sc[k]);
}

function syncRows() {
  $$('#rows input').forEach((el, k) => {
    el.value = draft[k].pct;
    el.nextElementSibling.textContent = draft[k].pct + '%';
  });
  $('#bTot').textContent = draft.reduce((a, d) => a + d.pct, 0) + '%';
}

function drawRows() {
  $('#rows').innerHTML = draft.map((d, i) => `<div class="rrow ${i === focus ? 'f' : ''}"><i class="dot" style="background:${d.color}"></i><span class="rn">${esc(d.name)}</span><input type="range" min="0" max="100" value="${d.pct}" data-i="${i}" style="accent-color:${d.color}" ${draft.length === 1 ? 'disabled' : ''}><output>${d.pct}%</output></div>`).join('');
  syncRows();
}

function openAlloc(mode, id) {
  draft = S.buckets.map(b => ({ ...b }));
  editingId = null;
  focus = null;
  $('#bErr').textContent = '';
  $('#delBox').hidden = true;
  $('#bDel').style.display = 'none';
  if (mode === 'new') {
    const c = COLORS.find(c => !S.buckets.some(b => b.color === c)) || COLORS[S.buckets.length % COLORS.length];
    draft.push({ id: uid(), name: 'New bucket', pct: 0, color: c, isNew: true });
    focus = draft.length - 1;
    setPct(focus, 10);
    $('#bT').textContent = 'New bucket';
    $('#bN').value = '';
  } else if (mode === 'edit') {
    editingId = id;
    focus = draft.findIndex(d => d.id === id);
    $('#bT').textContent = 'Edit bucket';
    $('#bN').value = draft[focus].name;
    $('#bDel').style.display = S.buckets.length > 1 ? '' : 'none';
  } else $('#bT').textContent = 'Rebalance buckets';
  $('#nameRow').hidden = focus === null;
  drawRows();
  $('#dB').showModal();
}
$('#addB').onclick = () => openAlloc('new');
$('#rebal').onclick = () => openAlloc('rebal');
$('#buckets').onclick = e => {
  const b = e.target.closest('[data-edit]');
  if (b) openAlloc('edit', b.dataset.edit);
};
$('#rows').oninput = e => {
  const i = +e.target.dataset.i;
  if (isNaN(i)) return;
  setPct(i, Math.round(+e.target.value));
  syncRows();
};
$('#bN').oninput = e => {
  if (focus === null) return;
  draft[focus].name = e.target.value.trim() || 'New bucket';
  $$('#rows .rn')[focus].textContent = draft[focus].name;
};
$('#fB').onsubmit = e => {
  e.preventDefault();
  if (focus !== null && !$('#bN').value.trim()) return ($('#bErr').textContent = 'Give the bucket a name.');
  if (draft.reduce((a, d) => a + d.pct, 0) !== 100) return ($('#bErr').textContent = 'Total must be 100%.');
  draft.forEach((d, i) => {
    if (d.isNew) S.buckets.push({ id: d.id, name: $('#bN').value.trim(), pct: d.pct, color: d.color });
    else {
      const b = S.buckets.find(x => x.id === d.id);
      b.pct = d.pct;
      if (i === focus) b.name = $('#bN').value.trim();
    }
  });
  $('#dB').close();
  render();
  toast('Allocation saved');
};
$('#bDel').onclick = () => {
  $('#dTo').innerHTML = S.buckets.filter(b => b.id !== editingId).map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
  $('#delBox').hidden = false;
};
$('#dGo').onclick = () => {
  const id = editingId,
    to = $('#dTo').value,
    b = S.buckets.find(x => x.id === id),
    bal = flows(id).bal;
  if (bal > 0) S.tx.push({ id: uid(), kind: 'transfer', date: dkey(new Date()), desc: 'Moved from deleted ' + b.name, cents: bal, from: id, to });
  S.wish.forEach(w => {
    if (w.bucket === id) w.bucket = to;
  });
  S.archived.push({ id: b.id, name: b.name });
  S.buckets = S.buckets.filter(x => x.id !== id);
  const sc = scale(S.buckets.map(x => x.pct), 100);
  S.buckets.forEach((x, i) => x.pct = sc[i]);
  $('#dB').close();
  render();
  toast('Bucket deleted, percentages rebalanced');
};
$$('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());

render();
