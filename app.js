'use strict';

// VRAM is addressed in 16-bit words, like the PPU registers ($2116, BGnSC, BGxxNBA, OBSEL).
const VRAM_WORDS = 0x8000;
const CELL_WORDS = 0x10;              // 32 bytes per cell = one 4bpp tile
const COLS = 16;
const ROW_WORDS = CELL_WORDS * COLS;  // $100
const ROWS = VRAM_WORDS / ROW_WORDS;  // 128
const CELLS = ROWS * COLS;

const WORDS_PER_TILE = { 2: 8, 4: 16, 8: 32 };
const MAP_SIZES = { '32x32': 0x400, '64x32': 0x800, '32x64': 0x800, '64x64': 0x1000 };
// Tile format of each BG per mode (Mode 7 not handled yet).
// How much of a map is really used for mapping; the rest is free for other data.
const MAP_USAGE = [['full', 'Full'], ['top', 'Top'], ['bottom', 'Bottom'], ['custom', 'Custom']];
const MODE_BPP = [[2, 2, 2, 2], [4, 4, 2], [4, 4], [8, 4], [8, 2], [4, 2], [4]];

const SPR_ALIGN = 0x2000;             // OBSEL base step
const SPR_GAPS = [0x1000, 0x2000, 0x3000, 0x4000]; // OBSEL name select
const SPR_SHEET_WORDS = 0x1000;       // 256 tiles x 4bpp
const BG_TILE_ALIGN = 0x1000;         // BG12NBA / BG34NBA step
const BG_MAP_ALIGN = 0x400;           // BGnSC step
const MAX_BG_TILES = 1024;            // 10-bit tile number in map entries

const STORAGE_KEY = 'vramBudgetter.v1';
const CONDENSED_KEY = 'vramBudgetter.condensed';

// One-time move of settings saved under the old app name (vramBudgeter.*) to the new keys.
for (const suffix of ['v1', 'condensed', 'codeFormat']) {
  try {
    const old = localStorage.getItem(`vramBudgeter.${suffix}`);
    if (old !== null && localStorage.getItem(`vramBudgetter.${suffix}`) === null) localStorage.setItem(`vramBudgetter.${suffix}`, old);
    localStorage.removeItem(`vramBudgeter.${suffix}`);
  } catch (_) { /* ignore */ }
}

function defaultState() {
  return {
    mode: 1,
    regions: {
      SPR:    { enabled: true, addr: null, offset: null, size: null, color: '#ff6b6b' },
      SPR_EX: { enabled: true, addr: null, offset: null, size: null, color: '#ffa94d' },
      // BGnT.enabled switches the whole layer (tiles + map) on or off.
      BG1T: { enabled: true, addr: null, offset: null, size: null, bpp: 4, color: '#4dabf7' },
      BG1M: { addr: null, mapSize: '32x32', tileSize: '8x8', usage: 'full', useStart: null, useEnd: null, color: '#1971c2' },
      BG2T: { enabled: true, addr: null, offset: null, size: null, bpp: 4, color: '#69db7c' },
      BG2M: { addr: null, mapSize: '32x32', tileSize: '8x8', usage: 'full', useStart: null, useEnd: null, color: '#2b8a3e' },
      BG3T: { enabled: true, addr: null, offset: null, size: null, bpp: 2, color: '#da77f2' },
      BG3M: { addr: null, mapSize: '32x32', tileSize: '8x8', usage: 'full', useStart: null, useEnd: null, color: '#9c36b5' },
      BG4T: { enabled: true, addr: null, offset: null, size: null, bpp: 2, color: '#ffd43b' },
      BG4M: { addr: null, mapSize: '32x32', tileSize: '8x8', usage: 'full', useStart: null, useEnd: null, color: '#e67700' },
    },
  };
}

function loadState() {
  try {
    return mergeState(JSON.parse(localStorage.getItem(STORAGE_KEY))) || defaultState();
  } catch (_) {
    return defaultState();  // no storage or bad data
  }
}

const HEX_FIELDS = ['addr', 'offset', 'size', 'useStart', 'useEnd'];

// Builds a full state from saved/imported data on top of the defaults, keeping only
// known fields of the right type. Hex fields accept numbers or "$1234" strings.
// Returns null when the data doesn't look like a budget at all.
function mergeState(data) {
  if (!data || typeof data !== 'object' || !data.regions || typeof data.regions !== 'object') return null;
  const s = defaultState();
  if (Number.isInteger(data.mode) && data.mode >= 0 && data.mode < MODE_BPP.length) s.mode = data.mode;
  for (const [id, region] of Object.entries(s.regions)) {
    const src = data.regions[id];
    if (!src || typeof src !== 'object') continue;
    for (const key of Object.keys(region)) {
      const v = src[key];
      if (v === undefined) continue;
      if (HEX_FIELDS.includes(key)) {
        const n = typeof v === 'string' ? parseHex(v) : v;
        region[key] = Number.isInteger(n) && n >= 0 && n <= 0xFFFF ? n : null;
      } else if (typeof v === typeof region[key]) {
        region[key] = v;
      }
    }
  }
  MODE_BPP[s.mode].forEach((bpp, i) => { s.regions[`BG${i + 1}T`].bpp = bpp; });  // the mode decides the tile format
  return s;
}

// Budget as a JSON string for the clipboard, with addresses written as "$1234".
function exportState() {
  const regions = {};
  for (const [id, r] of Object.entries(state.regions)) {
    regions[id] = {};
    for (const [key, v] of Object.entries(r)) {
      regions[id][key] = HEX_FIELDS.includes(key) && v != null ? hex(v) : v;
    }
  }
  return JSON.stringify({ app: 'VRAM Budgetter', version: 1, mode: state.mode, regions }, null, 2);
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* ignore */ }
}

let state = loadState();

// ---------- helpers ----------

const hex = (n, digits = 4) => '$' + n.toString(16).toUpperCase().padStart(digits, '0');
const range = (start, end) => `${hex(start)}–${hex(end - 1)}`;

// Word count -> "8192 bytes (8 KB)"; KB keeps up to 2 decimals.
function byteSize(words) {
  const bytes = words * 2;
  return `${bytes} bytes (${+(bytes / 1024).toFixed(2)} KB)`;
}

function parseHex(text) {
  const s = text.trim().replace(/^(\$|0x)/i, '');
  return /^[0-9a-f]{1,4}$/i.test(s) ? parseInt(s, 16) : null;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const stripes = colors => `linear-gradient(90deg, ${colors
  .map((c, i) => `${c} ${(i * 100) / colors.length}% ${((i + 1) * 100) / colors.length}%`)
  .join(', ')})`;

// ---------- grid ----------

const cellEls = [];

function buildGrid() {
  const frag = document.createDocumentFragment();
  frag.append(el('div', 'col-head'));
  for (let c = 0; c < COLS; c++) frag.append(el('div', 'col-head', hex(c * CELL_WORDS, 2)));

  for (let r = 0; r < ROWS; r++) {
    const base = r * ROW_WORDS;
    const major = base % 0x1000 === 0;
    frag.append(el('div', 'row-head' + (major ? ' major' : ''), hex(base)));
    for (let c = 0; c < COLS; c++) {
      const cell = el('div', 'cell' + (major ? ' major' : ''));
      cellEls.push(cell);
      frag.append(cell);
    }
  }
  document.getElementById('grid').append(frag);
}

// Condensed view: keep the normal column width, shrink row height so all rows fit under the headers.
function fitGrid() {
  const grid = document.getElementById('grid');
  const condensed = document.getElementById('condensed').checked;
  grid.classList.toggle('condensed', condensed);
  if (!condensed) {
    grid.style.removeProperty('--cell-h');
    return;
  }
  const scroll = document.getElementById('grid-scroll');
  const gap = 1;
  const header = grid.querySelector('.col-head').offsetHeight + gap;
  const avail = scroll.clientHeight - parseFloat(getComputedStyle(scroll).paddingBottom) - header;
  const cell = Math.max(2, Math.floor((avail + gap) / ROWS) - gap);
  grid.style.setProperty('--cell-h', cell + 'px');
}

function onCondensedToggle(e) {
  try { localStorage.setItem(CONDENSED_KEY, e.target.checked ? '1' : '0'); } catch (_) { /* ignore */ }
  fitGrid();
}

// ---------- panel ----------

const hexInput = (id, key, label, attrs = '') =>
  `<label class="fld" ${attrs}><span>${label}${helpIcon(helpKeyFor(id, key))}</span><input type="text" spellcheck="false" data-id="${id}" data-key="${key}"></label>`;

const selectField = (id, key, label, options) =>
  `<label class="fld"><span>${label}${helpIcon(helpKeyFor(id, key))}</span><select data-id="${id}" data-key="${key}">${options}</select></label>`;

const TARGET_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5"/><circle class="dot" cx="8" cy="8" r="1.5"/><path d="M8 0v4M8 12v4M0 8h4M12 8h4"/></svg>';

const targetButton = (id, label = '') =>
  `<button type="button" class="target" data-target="${id}" title="Show ${id} in the grid">${TARGET_ICON}${label ? `<span>${label}</span>` : ''}</button>`;

const colorInput = id => `<input type="color" data-id="${id}" data-key="color" title="${id} color">`;

function buildPanel() {
  document.getElementById('mode').innerHTML =
    MODE_BPP.map((bpps, m) =>
      `<option value="${m}">Mode ${m} — ${bpps.map((b, i) => `BG${i + 1} ${b}bpp`).join(', ')}</option>`
    ).join('') + '<option disabled>Mode 7 — not supported yet</option>';

  document.getElementById('sprites').innerHTML = ['SPR', 'SPR_EX'].map(id => `
    <div class="card" data-card="${id}">
      <div class="card-head">
        <label class="toggle"><input type="checkbox" data-id="${id}" data-key="enabled"> ${id}</label>${helpIcon(helpKeyFor(id, 'enabled'))}
        <div class="targets">${targetButton(id)}</div>
      </div>
      <div class="sub">${colorInput(id)}<span class="tag">Tiles</span>${hexInput(id, 'addr', 'Address')}${hexInput(id, 'offset', 'Offset')}${hexInput(id, 'size', 'Size')}</div>
      <div class="info" id="info-${id}"></div>
    </div>`).join('');

  document.getElementById('bgs').innerHTML = [1, 2, 3, 4].map(n => {
    const t = `BG${n}T`, m = `BG${n}M`;
    return `
    <div class="card" data-card="BG${n}">
      <div class="card-head">
        <label class="toggle"><input type="checkbox" data-id="${t}" data-key="enabled"> BG${n}</label>${helpIcon('bg.enabled')}
        <select data-id="${t}" data-key="bpp" title="Tile format (set by the mode)" disabled>${[2, 4, 8].map(b => `<option value="${b}">${b}bpp</option>`).join('')}</select>${helpIcon('bg.bpp')}
        <div class="targets">${targetButton(t, 'Tiles')}${targetButton(m, 'Map')}</div>
      </div>
      <div class="sub">${colorInput(t)}<span class="tag">Tiles</span>${hexInput(t, 'addr', 'Address')}${hexInput(t, 'offset', 'Offset')}${hexInput(t, 'size', 'Size')}</div>
      <div class="sub">${colorInput(m)}<span class="tag">Map</span>${hexInput(m, 'addr', 'Address')}
        ${selectField(m, 'mapSize', 'Size', Object.keys(MAP_SIZES).map(s => `<option>${s}</option>`).join(''))}
        ${selectField(m, 'tileSize', 'Tile size', ['8x8', '16x16'].map(s => `<option>${s}</option>`).join(''))}
      </div>
      <div class="sub"><span></span><span></span>
        ${selectField(m, 'usage', 'Usage', MAP_USAGE.map(([v, l]) => `<option value="${v}">${l}</option>`).join(''))}
        ${hexInput(m, 'useStart', 'Start', 'data-range')}${hexInput(m, 'useEnd', 'End', 'data-range')}
      </div>
      <div class="info" id="info-BG${n}"></div>
    </div>`;
  }).join('');
}

function syncInputs() {
  document.getElementById('mode').value = state.mode;
  for (const input of document.querySelectorAll('#panel [data-id]')) {
    const v = state.regions[input.dataset.id][input.dataset.key];
    if (input.type === 'checkbox') input.checked = v;
    else if (input.type === 'text') {
      input.value = v == null ? '' : hex(v);
      input.classList.remove('bad');  // empty is fine; only text typed as invalid hex is flagged
    } else input.value = v;
  }
}

function setMode(mode) {
  state.mode = mode;
  MODE_BPP[mode].forEach((bpp, i) => { state.regions[`BG${i + 1}T`].bpp = bpp; });
  syncInputs();
  update();
}

function onInput(e) {
  const t = e.target;
  if (t.id === 'mode') { setMode(+t.value); return; }
  const { id, key } = t.dataset;
  if (!id) return;
  const r = state.regions[id];
  if (key === 'usage' && t.value === 'custom' && r.usage !== 'custom') {
    // Start the custom range from what was used so far.
    const u = mapUsedRange(r) || { start: 0, end: MAP_SIZES[r.mapSize] };
    Object.assign(r, { usage: 'custom', useStart: u.start, useEnd: u.end - 1 });
    syncInputs();
    update();
    return;
  }
  if (t.type === 'checkbox') r[key] = t.checked;
  else if (t.type === 'text') {
    // Empty = not set; invalid hex is also stored as not set, but flagged red.
    r[key] = parseHex(t.value);
    t.classList.toggle('bad', r[key] == null && t.value.trim() !== '');
  }
  else r[key] = t.value;
  update();
}

function onFocusOut(e) {
  const t = e.target;
  if (t.type !== 'text' || !t.dataset.id) return;
  const v = state.regions[t.dataset.id][t.dataset.key];
  if (v != null) t.value = hex(v);
}

// ---------- analysis ----------

// Part of a map used for mapping, as [start, end) word offsets from its base; null if the custom range is invalid.
function mapUsedRange(rm) {
  const words = MAP_SIZES[rm.mapSize];
  switch (rm.usage) {
    case 'top': return { start: 0, end: words / 2 };
    case 'bottom': return { start: words / 2, end: words };
    case 'custom':
      if (rm.useStart == null || rm.useEnd == null || rm.useStart > rm.useEnd || rm.useEnd >= words) return null;
      return { start: rm.useStart, end: rm.useEnd + 1 };
    default: return { start: 0, end: words };
  }
}

// Regions as the analysis and the init code see them: an empty Offset means 0.
function effectiveRegions() {
  const out = {};
  for (const [id, r] of Object.entries(state.regions)) out[id] = 'offset' in r ? { ...r, offset: r.offset ?? 0 } : r;
  return out;
}

// A block isn't placed until it has an address (and a size, for tiles). Empty or invalid fields are null.
const isUnset = r => r.addr == null || ('size' in r && r.size == null);

function analyze() {
  const R = effectiveRegions();
  const bpps = MODE_BPP[state.mode];
  const active = [], spare = [], msgs = [], info = {}, budget = [];
  const error = (text, addr) => msgs.push({ level: 'error', text, addr });
  const warn = (text, addr) => msgs.push({ level: 'warn', text, addr });
  const unset = id => isUnset(R[id]);

  // Registers a region for drawing / overlap checks. Returns its unclamped range.
  function place(id, start, size) {
    if (size === 0) return null;
    const end = start + size;
    if (end > VRAM_WORDS) error(`${id}: ${range(start, end)} runs past the end of VRAM ($7FFF)`, Math.min(start, VRAM_WORDS - 1));
    const s = Math.min(start, VRAM_WORDS), e = Math.min(end, VRAM_WORDS);
    if (e > s) active.push({ id, start: s, end: e, color: R[id].color });
    return { start, end };
  }

  // Unused part of a map: drawn hatched, not counted as used, never conflicts.
  function addSpare(id, start, end) {
    const s = Math.min(start, VRAM_WORDS), e = Math.min(end, VRAM_WORDS);
    if (e > s) spare.push({ id, start: s, end: e, color: R[id].color });
  }

  // Shared by sprite sheets and BG tile sets: data lives at base + offset.
  // maxTiles = how many tiles the hardware can address from the base (256 per sprite sheet, 1024 per BG).
  function placeTiles(id, wpt, maxTiles) {
    const r = R[id];
    if (r.offset % wpt) warn(`${id}: offset ${hex(r.offset)} is not on a tile boundary (${hex(wpt)} words per tile)`, r.addr + r.offset);
    if (r.size % wpt) warn(`${id}: size ${hex(r.size)} is not a whole number of tiles`, r.addr + r.offset);
    const first = Math.floor(r.offset / wpt);
    budget.push({ id, words: r.size, tiles: Math.floor(r.size / wpt), maxTiles: Math.max(0, maxTiles - first) });
    const p = place(id, r.addr + r.offset, r.size);
    if (!p) return 'empty';
    let text = `${range(p.start, p.end)} · ${Math.floor(r.size / wpt)} tiles · ${byteSize(r.size)}`;
    if (first) text += ` · tile numbers start at #${first} (${hex(first, 3)})`;
    return text;
  }

  for (const id of ['SPR', 'SPR_EX']) {
    const r = R[id];
    if (!r.enabled) { info[id] = 'disabled'; continue; }
    if (unset(id)) { info[id] = 'Not set: enter an address and a size.'; continue; }

    if (id === 'SPR' && r.addr % SPR_ALIGN) {
      error(`SPR: base ${hex(r.addr)} must be a multiple of $2000 (OBSEL)`, r.addr);
    }
    if (id === 'SPR_EX') {
      if (!R.SPR.enabled) {
        warn('SPR_EX: its base is relative to SPR — enable SPR to validate it');
      } else if (!unset('SPR')) {
        const gap = (r.addr - R.SPR.addr + VRAM_WORDS) % VRAM_WORDS;
        if (!SPR_GAPS.includes(gap)) {
          error(`SPR_EX: base must be SPR + $1000/$2000/$3000/$4000 (OBSEL name select), currently SPR + ${hex(gap)}`, r.addr);
        }
      }
    }
    if (r.offset + r.size > SPR_SHEET_WORDS) {
      error(`${id}: offset + size exceeds the 256-tile sheet ($1000 words)`, r.addr);
    }
    info[id] = placeTiles(id, WORDS_PER_TILE[4], SPR_SHEET_WORDS / WORDS_PER_TILE[4]);
  }

  bpps.forEach((_, i) => {
    const n = i + 1, t = `BG${n}T`, m = `BG${n}M`;
    if (!R[t].enabled) return;
    const lines = [];

    const rt = R[t];
    if (unset(t)) lines.push('Tiles not set: enter an address and a size.');
    else {
      const wpt = WORDS_PER_TILE[rt.bpp];
      if (rt.addr % BG_TILE_ALIGN) error(`${t}: base ${hex(rt.addr)} must be a multiple of $1000 (BG12NBA/BG34NBA)`, rt.addr);
      if (rt.offset + rt.size > MAX_BG_TILES * wpt) {
        error(`${t}: offset + size exceeds the 1024 tiles reachable from the base (${hex(MAX_BG_TILES * wpt)} words at ${rt.bpp}bpp)`, rt.addr);
      }
      lines.push('Tiles ' + placeTiles(t, wpt, MAX_BG_TILES));
    }

    const rm = R[m];
    if (unset(m)) lines.push('Map not set: enter an address.');
    else {
      if (rm.addr % BG_MAP_ALIGN) error(`${m}: base ${hex(rm.addr)} must be a multiple of $400 (BG${n}SC)`, rm.addr);
      const words = MAP_SIZES[rm.mapSize];
      let used = mapUsedRange(rm);
      if (!used) {
        error(`${m}: custom usage must be valid hex with Start ≤ End inside the map ($0000–${hex(words - 1)})`, rm.addr);
        used = { start: 0, end: words };
      }
      place(m, rm.addr + used.start, used.end - used.start);
      addSpare(m, rm.addr, rm.addr + used.start);
      addSpare(m, rm.addr + used.end, rm.addr + words);

      // BGMODE character size; Modes 5/6 are hi-res, so tiles are always 16 pixels wide.
      const [cols, rows] = rm.mapSize.split('x').map(Number);
      const tileH = rm.tileSize === '16x16' ? 16 : 8;
      const tileW = rm.tileSize === '16x16' || state.mode >= 5 ? 16 : 8;
      const usageLabel = MAP_USAGE.find(([v]) => v === rm.usage)[1];
      budget.push({ id: m, words: used.end - used.start, detail: `${rm.mapSize} · ${rm.tileSize} · ${usageLabel}` });
      lines.push(`Map ${range(rm.addr, rm.addr + words)} · ${rm.mapSize} · ${byteSize(words)} · ${tileW}x${tileH} tiles → ${cols * tileW}x${rows * tileH} px`);
      if (used.end - used.start < words) {
        const free = [[0, used.start], [used.end, words]]
          .filter(([s, e]) => e > s)
          .map(([s, e]) => range(rm.addr + s, rm.addr + e))
          .join(', ');
        lines.push(`Used ${range(rm.addr + used.start, rm.addr + used.end)} · ${byteSize(used.end - used.start)} · spare ${free}`);
      }
    }
    info[`BG${n}`] = lines.join('\n');
  });

  const conflicts = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i], b = active[j];
      const s = Math.max(a.start, b.start), e = Math.min(a.end, b.end);
      if (s < e) {
        conflicts.push([s, e]);
        error(`Overlap: ${a.id} and ${b.id} at ${range(s, e)}`, s);
      }
    }
  }

  const rank = { error: 0, warn: 1 };
  msgs.sort((a, b) => rank[a.level] - rank[b.level]);
  return { active, spare, msgs, info, conflicts, budget };
}

// ---------- render ----------

const hatch = color => `repeating-linear-gradient(135deg, ${color}77 0 3px, transparent 3px 6px), var(--free)`;

function cellOwners(regions) {
  const owners = Array.from({ length: CELLS }, () => []);
  for (const r of regions) {
    const last = Math.floor((r.end - 1) / CELL_WORDS);
    for (let c = Math.floor(r.start / CELL_WORDS); c <= last; c++) owners[c].push(r);
  }
  return owners;
}

const kb = words => `${+(words * 2 / 1024).toFixed(2)} KB`;
const regionName = id => id.replace(/^(BG\d)T$/, '$1 tiles').replace(/^(BG\d)M$/, '$1 map');

// One row per enabled region: allocated size, and tiles allocated / addressable (maps: size + usage).
function renderBudget(budget) {
  const rows = budget.map(b => {
    const tr = el('tr');
    const name = el('td', 'b-name');
    const swatch = el('span', 'swatch');
    swatch.style.background = state.regions[b.id].color;
    name.append(swatch, regionName(b.id));
    const tiles = b.tiles != null
      ? el('td', 'b-num', `${b.tiles} / ${b.maxTiles}`)
      : el('td', 'b-detail', b.detail);
    tr.append(name, el('td', 'b-num', kb(b.words)), tiles);
    return tr;
  });
  const total = el('tr', 'b-total');
  total.append(el('td', null, 'Total allocated'), el('td', 'b-num', kb(budget.reduce((n, b) => n + b.words, 0))), el('td'));
  document.getElementById('budget-rows').replaceChildren(...rows, total);
}

function render({ active, spare, msgs, info, conflicts, budget }) {
  renderBudget(budget);
  const owners = cellOwners(active);
  const spareOwners = cellOwners(spare);
  const used = new Uint8Array(VRAM_WORDS);
  for (const r of active) used.fill(1, r.start, r.end);

  const bad = new Uint8Array(CELLS);
  for (const [s, e] of conflicts) bad.fill(1, Math.floor(s / CELL_WORDS), Math.floor((e - 1) / CELL_WORDS) + 1);

  cellEls.forEach((cell, i) => {
    const o = owners[i], sp = spareOwners[i];
    cell.style.background =
      o.length > 1 ? stripes(o.map(r => r.color)) :
      o.length === 1 ? o[0].color :
      sp.length ? hatch(sp[0].color) : '';
    cell.classList.toggle('conflict', bad[i] === 1);
    const names = [...o.map(r => r.id), ...sp.map(r => `${r.id} (spare)`)];
    cell.title = `${range(i * CELL_WORDS, (i + 1) * CELL_WORDS)}  ${names.join(', ') || 'free'}`;
  });

  // Cards
  const bgCount = MODE_BPP[state.mode].length;
  for (let n = 1; n <= 4; n++) {
    const card = document.querySelector(`[data-card="BG${n}"]`);
    card.classList.toggle('hidden', n > bgCount);
    card.classList.toggle('collapsed', !state.regions[`BG${n}T`].enabled);
    // Start/End are editable for Custom; otherwise they show the preset's range, read-only.
    const rm = state.regions[`BG${n}M`];
    const custom = rm.usage === 'custom';
    const preset = custom ? null : mapUsedRange(rm);
    for (const input of card.querySelectorAll('[data-range] input')) {
      input.readOnly = !custom;
      if (!custom) {
        input.value = hex(input.dataset.key === 'useStart' ? preset.start : preset.end - 1);
        input.classList.remove('bad');
      }
    }
  }
  for (const id of ['SPR', 'SPR_EX']) {
    document.querySelector(`[data-card="${id}"]`).classList.toggle('off', !state.regions[id].enabled);
  }
  for (const [key, text] of Object.entries(info)) document.getElementById(`info-${key}`).textContent = text;

  // Usage
  let words = 0;
  for (const v of used) words += v;
  const pct = (words / VRAM_WORDS) * 100;
  document.getElementById('usage').textContent =
    `${(words * 2 / 1024).toFixed(1)} / 64 KB used (${pct.toFixed(1)}%)`;
  const fill = document.getElementById('usage-fill');
  fill.style.width = pct + '%';
  fill.classList.toggle('high', pct >= 90 && pct < 100);
  fill.classList.toggle('full', pct >= 100);
  document.getElementById('usage-meter').setAttribute('aria-valuenow', pct.toFixed(1));

  // Messages
  const list = document.getElementById('messages');
  list.replaceChildren();
  if (!msgs.length) list.append(el('li', 'ok', 'No conflicts — layout is valid.'));
  for (const m of msgs) {
    const item = el('li', m.level, m.text);
    if (m.addr != null) item.dataset.addr = m.addr;
    list.append(item);
  }
}

// ---------- init code ----------

const MAP_SIZE_BITS = { '32x32': 0, '64x32': 1, '32x64': 2, '64x64': 3 };

// What the init code contains, independent of the output format: equates for each block's data
// (where it is copied to in VRAM, as a word address: base + offset for tiles, the used part for maps,
// and its size in bytes) and the PPU register writes that point at VRAM
// (BGMODE, OBSEL, BGnSC, BG12NBA/BG34NBA, TM, VMAIN).
function buildInitModel() {
  const R = effectiveRegions();
  const bpps = MODE_BPP[state.mode];
  const valid = id => !isUnset(R[id]);

  const sprOn = R.SPR.enabled && valid('SPR');
  const sprGap = sprOn && R.SPR_EX.enabled && valid('SPR_EX')
    ? (R.SPR_EX.addr - R.SPR.addr + VRAM_WORDS) % VRAM_WORDS : null;
  const sprExOn = sprGap != null;
  // A layer's tiles and map are emitted as soon as each is set; it goes on the main screen once both are.
  const layers = bpps.map((_, i) => i + 1).filter(n => R[`BG${n}T`].enabled);
  const tileBgs = layers.filter(n => valid(`BG${n}T`));
  const mapBgs = layers.filter(n => valid(`BG${n}M`) && mapUsedRange(R[`BG${n}M`]));
  const bgs = tileBgs.filter(n => mapBgs.includes(n));

  const equates = [];
  const block = (name, start, words, comment) => {
    equates.push({ name: `${name}_ADDRESS`, value: start, comment });
    equates.push({ name: `${name}_SIZE`, value: words * 2, comment: 'bytes' });
  };
  if (sprOn) block('VRAM_SPR_TILES', R.SPR.addr + R.SPR.offset, R.SPR.size, 'SPR tiles');
  if (sprExOn) block('VRAM_SPR_EX_TILES', R.SPR_EX.addr + R.SPR_EX.offset, R.SPR_EX.size, 'SPR_EX tiles');
  for (const n of layers) {
    const t = R[`BG${n}T`], m = R[`BG${n}M`];
    if (tileBgs.includes(n)) block(`VRAM_BG${n}_TILES`, t.addr + t.offset, t.size, `BG${n} tiles, ${t.bpp}bpp`);
    if (mapBgs.includes(n)) {
      const used = mapUsedRange(m);
      block(`VRAM_BG${n}_MAP`, m.addr + used.start, used.end - used.start,
        `BG${n} map, ${m.mapSize}, ${m.tileSize} tiles` + (m.usage === 'full' ? '' : `, ${m.usage} part`));
    }
  }

  // Register writes. Address-based values are written as expressions on the *_ADDRESS equates
  // (`expr(num)`, where num formats a constant for the target syntax), so editing an equate updates
  // the routine. An equate points at the data, so its offset from the register's base is subtracted.
  const regs = [];
  const set = (reg, value, comment, expr = null) => regs.push({ reg, value: value & 0xFF, comment, expr });
  const baseOf = (name, offset) => num => offset ? `(${name} - ${num(offset)})` : name;

  const tileBits = mapBgs.filter(n => R[`BG${n}M`].tileSize === '16x16');
  set(0x2105, state.mode | tileBits.reduce((v, n) => v | 1 << (3 + n), 0), `BGMODE: mode ${state.mode}` +
    (mapBgs.length ? ', ' + mapBgs.map(n => `BG${n} ${R[`BG${n}M`].tileSize}`).join(' ') : ''));

  const nameSelect = sprExOn && SPR_GAPS.includes(sprGap) ? sprGap / 0x1000 - 1 : 0;
  if (sprOn) {
    const spr = baseOf('VRAM_SPR_TILES_ADDRESS', R.SPR.offset);
    const ex = baseOf('VRAM_SPR_EX_TILES_ADDRESS', R.SPR_EX.offset);
    const withEx = sprExOn && SPR_GAPS.includes(sprGap);
    set(0x2101, ((R.SPR.addr >> 13) & 7) | nameSelect << 3,
      `OBSEL: base ${hex(R.SPR.addr)}` + (sprExOn ? `, 2nd table +${hex(sprGap)}` : '') + ', size bits 5-7 = 0: set yours',
      num => `(${spr(num)} >> 13)` +
        (withEx ? ` | (((((${ex(num)} - ${spr(num)}) & ${num(0x7FFF)}) >> 12) - 1) << 3)` : ''));
  } else {
    set(0x2101, 0, 'OBSEL: no sprites');
  }

  for (const n of mapBgs) {
    const m = R[`BG${n}M`];
    const map = baseOf(`VRAM_BG${n}_MAP_ADDRESS`, mapUsedRange(m).start);
    const sizeBits = MAP_SIZE_BITS[m.mapSize];
    set(0x2106 + n, (m.addr >> 10) << 2 | sizeBits, `BG${n}SC: map ${hex(m.addr)}, ${m.mapSize}`,
      num => `((${map(num)} >> 10) << 2)` + (sizeBits ? ` | ${num(sizeBits)}` : ''));
  }

  const nba = n => tileBgs.includes(n) ? (R[`BG${n}T`].addr >> 12) & 0xF : 0;
  const nbaExpr = (lo, hi) => num => {
    const part = n => `(${baseOf(`VRAM_BG${n}_TILES_ADDRESS`, R[`BG${n}T`].offset)(num)} >> 12)`;
    const parts = [tileBgs.includes(lo) && part(lo), tileBgs.includes(hi) && `(${part(hi)} << 4)`].filter(Boolean);
    return parts.join(' | ') || num(0);
  };
  const nbaText = ns => ns.filter(n => tileBgs.includes(n)).map(n => `BG${n} ${hex(R[`BG${n}T`].addr)}`).join(', ') || 'unused';
  set(0x210B, nba(1) | nba(2) << 4, `BG12NBA: ${nbaText([1, 2])}`, nbaExpr(1, 2));
  if (bpps.length > 2) set(0x210C, nba(3) | nba(4) << 4, `BG34NBA: ${nbaText([3, 4])}`, nbaExpr(3, 4));
  const tm = bgs.reduce((v, n) => v | 1 << (n - 1), 0) | (sprOn ? 0x10 : 0);
  set(0x212C, tm, `TM: ${[...bgs.map(n => `BG${n}`), ...(sprOn ? ['OBJ'] : [])].join(' ') || 'nothing'} on main screen`);
  set(0x2115, 0x80, 'VMAIN: +1 word after writing $2119');

  return { equates, regs };
}

// Equate lines with names and values in aligned columns.
function equateLines(equates, line) {
  const width = Math.max(0, ...equates.map(e => e.name.length));
  return equates.map(e => line(e.name.padEnd(width), e).trimEnd());
}

const LAYOUT_NOTE = '*_ADDRESS: VRAM word address where to copy each block\'s data. *_SIZE: its size in bytes.';
const errorNote = n => n ? [`WARNING: STATUS reports ${n} error(s) - fix them before using this code.`] : [];

// A register's value in the target syntax: an expression on the equates, or a plain constant.
const regValue = (r, num, constant) => r.expr ? r.expr(num) : constant(r.value);

// Code followed by its comment at column `col`, or two spaces after the code when it's longer.
const withComment = (code, col, comment) =>
  (code.length < col - 1 ? code.padEnd(col) : code + '  ') + comment;

// 65816 routine body shared by the assembler formats; `abs` formats an absolute register address.
const asmRoutine = (regs, accu8, abs) => [
  '        pha                     ; save A at the caller\'s width (8 or 16 bits)',
  '        php                     ; save P (register sizes)',
  '        sep #$20',
  `        ${accu8}`,
  ...regs.flatMap(r => [
    withComment(`        lda #${regValue(r, n => hex(n, n > 0xFF ? 4 : 2), n => hex(n, 2))}`, 32, `; ${r.comment}`),
    `        sta ${abs(r.reg)}`,
  ]),
  '        plp                     ; restore P first, so pla pulls the same width',
  '        pla',
  '        rts',
];

// Output formats for the INIT CODE box. Each turns the model into lines of source.
const CODE_FORMATS = {
  ca65: {
    label: 'ca65 (cc65)',
    hint: 'call during forced blank',
    render: ({ equates, regs }, errors) => [
      `; VRAM Budgetter - PPU init for Mode ${state.mode} (ca65 / cc65)`,
      `; ${LAYOUT_NOTE}`,
      '; Call during forced blank (INIDISP = $80) with DB in bank $00-$3F or $80-$BF.',
      ...errorNote(errors).map(s => `; ${s}`),
      '',
      '; ---- VRAM layout ----',
      ...equateLines(equates, (name, e) => `${name} = ${hex(e.value).padEnd(6)}  ; ${e.comment}`),
      '',
      '; ---- PPU setup ----',
      '.p816                           ; 65816 instructions (same as ca65 --cpu 65816)',
      '.proc InitVRAMLayout',
      ...asmRoutine(regs, '.a8', reg => hex(reg)),
      '.endproc',
      '',
    ],
  },

  wla: {
    label: 'WLA-DX',
    hint: 'put in a code .SECTION · forced blank',
    render: ({ equates, regs }, errors) => [
      `; VRAM Budgetter - PPU init for Mode ${state.mode} (WLA-DX 65816)`,
      `; ${LAYOUT_NOTE}`,
      '; Call during forced blank (INIDISP = $80) with DB in bank $00-$3F or $80-$BF.',
      '; Put InitVRAMLayout inside one of your code .SECTIONs.',
      ...errorNote(errors).map(s => `; ${s}`),
      '',
      '; ---- VRAM layout ----',
      ...equateLines(equates, (name, e) => `.DEFINE ${name} ${hex(e.value).padEnd(6)}  ; ${e.comment}`),
      '',
      '; ---- PPU setup ----',
      'InitVRAMLayout:',
      ...asmRoutine(regs, '.ACCU 8', reg => `${hex(reg)}.w`),
      '',
    ],
  },

  pvsneslib: {
    label: 'PVSnesLib (C)',
    hint: 'call after setMode(), screen off',
    render: ({ equates, regs }, errors) => {
      const c = (n, digits = 2) => '0x' + n.toString(16).toUpperCase().padStart(digits, '0');
      return [
        `// VRAM Budgetter - PPU init for Mode ${state.mode} (PVSnesLib / C)`,
        `// ${LAYOUT_NOTE}`,
        '// Call during forced blank (setScreenOff()), after consoleInit() and setMode():',
        '// it overrides the BGMODE, map/tile bases and main screen they set.',
        ...errorNote(errors).map(s => `// ${s}`),
        '',
        '// ---- VRAM layout ----',
        ...equateLines(equates, (name, e) => `#define ${name} ${c(e.value, 4).padEnd(7)}  // ${e.comment}`),
        '',
        '// ---- PPU setup ----',
        '#define VB_PPU_REG(addr) (*(volatile unsigned char *)(addr))',
        '',
        'void initVRAMLayout(void)',
        '{',
        ...regs.map(r => withComment(`    VB_PPU_REG(${c(r.reg, 4)}) = ${regValue(r, n => c(n, n > 0xFF ? 4 : 2), n => c(n))};`, 34, `// ${r.comment}`)),
        '}',
        '',
      ];
    },
  },
};

const FORMAT_KEY = 'vramBudgetter.codeFormat';

function codeFormat() {
  const value = document.getElementById('code-format').value;
  return CODE_FORMATS[value] ? value : 'ca65';
}

function genInitCode(errorCount) {
  const format = CODE_FORMATS[codeFormat()];
  document.getElementById('code-hint').textContent = format.hint;
  return format.render(buildInitModel(), errorCount).join('\n');
}

// Fills the format dropdown, restores the remembered choice (default ca65) and remembers changes.
function buildCodeFormats() {
  const sel = document.getElementById('code-format');
  sel.innerHTML = Object.entries(CODE_FORMATS).map(([v, f]) => `<option value="${v}">${f.label}</option>`).join('');
  let saved = null;
  try { saved = localStorage.getItem(FORMAT_KEY); } catch (_) { /* ignore */ }
  sel.value = CODE_FORMATS[saved] ? saved : 'ca65';
  sel.addEventListener('change', () => {
    try { localStorage.setItem(FORMAT_KEY, sel.value); } catch (_) { /* ignore */ }
    update();
  });
}

let lastActive = [];  // regions drawn by the last update, used by the target buttons

function update() {
  const result = analyze();
  lastActive = result.active;
  render(result);
  const code = genInitCode(result.msgs.filter(m => m.level === 'error').length);
  const area = document.getElementById('init-code');
  if (area.value !== code) area.value = code;  // keep the scroll position when nothing changed
  saveState();
}

// ---------- init ----------

// Scroll only the grid pane (never the page) so a cell sits at the top, below the sticky headers, or centred.
function scrollGridTo(cell, where = 'top') {
  const pane = document.getElementById('grid-scroll');
  const offset = cell.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
  const top = where === 'center' ? offset - pane.clientHeight / 2 : offset - 40;
  pane.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

function onMessageClick(e) {
  const item = e.target.closest('li[data-addr]');
  if (!item) return;
  const cell = cellEls[Math.min(Math.floor(+item.dataset.addr / CELL_WORDS), CELLS - 1)];
  scrollGridTo(cell, 'center');
  cell.classList.add('flash');
  setTimeout(() => cell.classList.remove('flash'), 1200);
}

// Highlights exactly the cells a region occupies in the last analysis: a map's used part only
// (not its spare part), tiles over their whole range wherever they sit.
function onTargetClick(e) {
  const btn = e.target.closest('[data-target]');
  if (!btn) return;
  const id = btn.dataset.target;
  const parts = lastActive.filter(r => r.id === id);
  if (!parts.length) {
    // Not drawn (empty, disabled or invalid): just show where its base is.
    const addr = state.regions[id].addr;
    if (addr != null) scrollGridTo(cellEls[Math.floor(Math.min(addr, VRAM_WORDS - 1) / CELL_WORDS)]);
    return;
  }
  const indexes = new Set();
  for (const r of parts) {
    for (let c = Math.floor(r.start / CELL_WORDS); c <= Math.floor((r.end - 1) / CELL_WORDS); c++) indexes.add(c);
  }
  scrollGridTo(cellEls[Math.min(...indexes)]);
  const cells = [...indexes].map(i => cellEls[i]);
  for (const c of cells) {
    c.classList.remove('spot');
    void c.offsetWidth;  // restart the animation on repeated clicks
    c.classList.add('spot');
  }
  setTimeout(() => cells.forEach(c => c.classList.remove('spot')), 1600);
}

// Briefly swap a button's label to confirm an action.
function flashLabel(btn, text) {
  clearTimeout(btn._labelTimer);
  btn.dataset.label ??= btn.textContent;
  btn.textContent = text;
  btn._labelTimer = setTimeout(() => { btn.textContent = btn.dataset.label; }, 1500);
}

async function onCopyCode(e) {
  const btn = e.currentTarget;
  const area = document.getElementById('init-code');
  try {
    await navigator.clipboard.writeText(area.value);
  } catch (_) {
    area.select();
    if (!document.execCommand('copy')) return;
  }
  flashLabel(btn, 'Copied!');
}

async function onCopy(e) {
  const btn = e.currentTarget;  // currentTarget is gone after the await
  const json = exportState();
  try {
    await navigator.clipboard.writeText(json);
  } catch (_) {
    // Clipboard API unavailable or denied: fall back to a hidden textarea.
    const ta = el('textarea');
    ta.value = json;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (!ok) { prompt('Copy this budget:', json); return; }
  }
  flashLabel(btn, 'Copied!');
}

async function onPaste(e) {
  const btn = e.currentTarget;
  let text;
  try {
    text = await navigator.clipboard.readText();
  } catch (_) {
    text = prompt('Paste a budget (JSON):');
    if (text == null) return;
  }
  if (!applyBudgetJSON(text)) {
    alert('The clipboard does not contain a VRAM Budgetter budget (JSON).');
    return;
  }
  flashLabel(btn, 'Loaded!');
}

// Replaces the budget with one read from JSON text (clipboard or file); false if it isn't a budget.
function applyBudgetJSON(text) {
  let next;
  try { next = mergeState(JSON.parse(text)); } catch (_) { next = null; }
  if (!next) return false;
  state = next;
  syncInputs();
  update();
  return true;
}

const BUDGET_FILE = 'vram-budget.json';

// Save: a "Save as" dialog where the browser has one (Edge/Chrome), otherwise a download.
async function onSave(e) {
  const btn = e.currentTarget;
  const json = exportState();
  if (window.showSaveFilePicker) {
    try {
      const handle = await showSaveFilePicker({
        suggestedName: BUDGET_FILE,
        types: [{ description: 'JSON file', accept: { 'application/json': ['.json'] } }],
        excludeAcceptAllOption: true,  // "Save as type" lists only JSON, no "All files"
      });
      const out = await handle.createWritable();
      await out.write(json);
      await out.close();
      flashLabel(btn, 'Saved!');
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;  // dialog cancelled
      // Any other failure (e.g. not allowed here): fall back to a download.
    }
  }
  const link = el('a');
  link.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  link.download = BUDGET_FILE;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  flashLabel(btn, 'Saved!');
}

async function onLoadFile(e) {
  const input = e.currentTarget;
  const file = input.files[0];
  input.value = '';  // so picking the same file again still fires change
  if (!file) return;
  if (!applyBudgetJSON(await file.text())) {
    alert(`"${file.name}" does not contain a VRAM Budgetter budget (JSON).`);
    return;
  }
  flashLabel(document.getElementById('load'), 'Loaded!');
}

function onReset() {
  if (!confirm('Reset all settings to defaults?')) return;
  state = defaultState();
  syncInputs();
  update();
}

buildGrid();
buildPanel();
buildCodeFormats();
syncInputs();
update();

const condensedSwitch = document.getElementById('condensed');
try { condensedSwitch.checked = localStorage.getItem(CONDENSED_KEY) === '1'; } catch (_) { /* ignore */ }
condensedSwitch.addEventListener('change', onCondensedToggle);
window.addEventListener('resize', fitGrid);
fitGrid();

const panel = document.getElementById('panel');
panel.addEventListener('input', onInput);
panel.addEventListener('focusout', onFocusOut);
panel.addEventListener('click', onTargetClick);
document.getElementById('messages').addEventListener('click', onMessageClick);
document.getElementById('reset').addEventListener('click', onReset);
document.getElementById('copy').addEventListener('click', onCopy);
document.getElementById('paste').addEventListener('click', onPaste);
document.getElementById('save').addEventListener('click', onSave);
document.getElementById('load').addEventListener('click', () => document.getElementById('load-file').click());
document.getElementById('load-file').addEventListener('change', onLoadFile);
document.getElementById('copy-code').addEventListener('click', onCopyCode);
