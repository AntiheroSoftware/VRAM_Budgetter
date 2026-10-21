'use strict';

// Help overlays: an (i) button next to a field shows what to enter and, for dropdowns,
// what each choice implies. Hover or focus shows it; click pins it; Esc or a click elsewhere closes it.
// Addresses and sizes are VRAM word addresses, like the PPU registers.

const HELP = {
  mode: {
    title: 'Graphics mode (BGMODE)',
    html: `Decides which BG layers exist and their tile format. Changing it resets each BG's format to the mode's.
      <ul>
        <li><b>0</b> — 4 layers, all 2bpp (4 colours each).</li>
        <li><b>1</b> — BG1/BG2 4bpp, BG3 2bpp. The usual choice.</li>
        <li><b>2</b> — BG1/BG2 4bpp with offset-per-tile scrolling.</li>
        <li><b>3</b> — BG1 8bpp (256 colours), BG2 4bpp. Big tile sets.</li>
        <li><b>4</b> — BG1 8bpp, BG2 2bpp, offset-per-tile.</li>
        <li><b>5</b> — 512-px hi-res: BG1 4bpp, BG2 2bpp.</li>
        <li><b>6</b> — 512-px hi-res: BG1 4bpp, offset-per-tile.</li>
      </ul>
      Modes 2, 4 and 6 read their offset-per-tile table from BG3's map, which isn't budgeted yet.`,
  },

  'spr.enabled': {
    title: 'SPR — first sprite table',
    html: 'Sprite tiles with names $000–$0FF. Untick it if you use no sprites; it leaves the budget.',
  },
  'sprex.enabled': {
    title: 'SPR_EX — second sprite table',
    html: 'Sprite tiles with names $100–$1FF (the name-table bit set in OAM). Untick it if 256 sprite tiles are enough.',
  },
  'spr.addr': {
    title: 'Sprite base (OBSEL)',
    html: 'Start of the first sprite table. Must be a multiple of <b>$2000</b> words: $0000, $2000, $4000 or $6000.',
  },
  'sprex.addr': {
    title: 'Second table (OBSEL name select)',
    html: 'Must be the SPR base + <b>$1000, $2000, $3000 or $4000</b> words (wrapping past $7FFF). $1000 puts it right after SPR.',
  },
  'spr.offset': {
    title: 'Offset into the sheet',
    html: 'Where your data starts inside the 256-tile sheet, in words. Tile names below it stay unused: your first tile is name #(offset ÷ $10).',
  },
  'spr.size': {
    title: 'Sprite data size',
    html: 'Words of 4bpp tile data: <b>$10 words per 8×8 tile</b>, up to $1000 (256 tiles) per sheet, offset included. A 16×16 sprite uses 4 tiles.',
  },

  'bg.enabled': {
    title: 'Layer on/off',
    html: 'Untick to leave this BG (tiles and map) out of the budget, e.g. a layer the mode has but you don\'t use. Its values are kept.',
  },
  'bg.bpp': {
    title: 'Tile format',
    html: `Bits per pixel of this layer's tiles. Read-only: the selected mode decides it, so change the Mode to change it.
      <ul>
        <li><b>2bpp</b> — 4 colours, 8 words per tile.</li>
        <li><b>4bpp</b> — 16 colours, 16 words per tile.</li>
        <li><b>8bpp</b> — 256 colours, 32 words per tile.</li>
      </ul>`,
  },
  'tiles.addr': {
    title: 'Tile base (BG12NBA / BG34NBA)',
    html: 'Start of this layer\'s character data; map tile #0 is here. Must be a multiple of <b>$1000</b> words.',
  },
  'tiles.offset': {
    title: 'Offset from the tile base',
    html: 'Your tiles start at base + offset, so the base stays aligned while the data sits elsewhere. Map entries must add <b>offset ÷ words-per-tile</b> to their tile numbers (shown under the card).',
  },
  'tiles.size': {
    title: 'Tile data size',
    html: 'Words of tile data (words per tile × tile count). A map can only reach <b>1024 tiles</b> from the base, offset included.',
  },
  'map.addr': {
    title: 'Map base (BGnSC)',
    html: 'Start of the tilemap. Must be a multiple of <b>$400</b> words. Each map entry is 1 word.',
  },
  'map.mapSize': {
    title: 'Map size (BGnSC)',
    html: `Size in map entries; 32×32 entries is one screen.
      <ul>
        <li><b>32x32</b> — 1 screen, $400 words.</li>
        <li><b>64x32</b> — 2 screens side by side, $800 words.</li>
        <li><b>32x64</b> — 2 screens stacked, $800 words.</li>
        <li><b>64x64</b> — 4 screens, $1000 words.</li>
      </ul>
      Bigger maps scroll further before wrapping, but cost more VRAM.`,
  },
  'map.tileSize': {
    title: 'Tile size (BGMODE)',
    html: `What each map entry draws. It doesn't change VRAM usage.
      <ul>
        <li><b>8x8</b> — one tile per entry.</li>
        <li><b>16x16</b> — 4 tiles per entry (N, N+1, N+16, N+17), so the map covers 4× the area. Lay tiles out in rows of 16.</li>
      </ul>
      Modes 5 and 6 always use 16-px-wide tiles.`,
  },
  'map.usage': {
    title: 'Map usage',
    html: `How much of the map memory is really used for mapping. The rest is free for other data: hatched on the grid, not counted as used, and allowed to overlap.
      <ul>
        <li><b>Full</b> — the whole map.</li>
        <li><b>Top</b> — the first half only.</li>
        <li><b>Bottom</b> — the second half only.</li>
        <li><b>Custom</b> — your own Start/End range.</li>
      </ul>
      For a 64x32 map the halves are the left and right screens.`,
  },
  'map.range': {
    title: 'Used range',
    html: 'Start and End offsets from the map base, End included. Editable with Usage = Custom; otherwise they show the preset\'s range.',
  },
};

const helpIcon = key =>
  `<button type="button" class="help" data-help="${key}" aria-label="Help: ${HELP[key].title}">i</button>`;

// Which help entry a panel field uses.
function helpKeyFor(id, key) {
  if (id === 'SPR_EX' && (key === 'addr' || key === 'enabled')) return `sprex.${key}`;
  if (id.startsWith('SPR')) return `spr.${key}`;
  if (id.endsWith('T')) return key === 'enabled' ? 'bg.enabled' : key === 'bpp' ? 'bg.bpp' : `tiles.${key}`;
  return key === 'useStart' || key === 'useEnd' ? 'map.range' : `map.${key}`;
}

const helpPop = document.createElement('div');
helpPop.id = 'help-pop';
helpPop.setAttribute('role', 'tooltip');
helpPop.hidden = true;
document.body.append(helpPop);

let helpPinned = null;

function showHelp(btn) {
  const h = HELP[btn.dataset.help];
  if (!h) return;
  helpPop.innerHTML = `<h3>${h.title}</h3>${h.html}`;
  helpPop.hidden = false;
  // Below the icon, kept inside the window; above it if there's no room below.
  const r = btn.getBoundingClientRect();
  const w = helpPop.offsetWidth, h2 = helpPop.offsetHeight;
  const left = Math.min(Math.max(8, r.left - 12), innerWidth - w - 8);
  const top = r.bottom + 6 + h2 > innerHeight - 8 ? Math.max(8, r.top - h2 - 6) : r.bottom + 6;
  helpPop.style.left = left + 'px';
  helpPop.style.top = top + 'px';
}

function hideHelp() {
  helpPop.hidden = true;
  helpPinned = null;
}

document.addEventListener('mouseover', e => {
  const btn = e.target.closest('.help');
  if (btn && !helpPinned) showHelp(btn);
});
document.addEventListener('mouseout', e => {
  const btn = e.target.closest('.help');
  if (btn && !helpPinned && !btn.contains(e.relatedTarget)) hideHelp();
});
document.addEventListener('focusin', e => { if (e.target.matches('.help')) showHelp(e.target); });
document.addEventListener('focusout', e => { if (e.target.matches('.help')) hideHelp(); });
document.addEventListener('click', e => {
  const btn = e.target.closest('.help');
  if (!btn) { if (helpPinned) hideHelp(); return; }
  e.preventDefault();  // don't let the surrounding <label> act on its field
  if (helpPinned === btn) hideHelp();
  else { showHelp(btn); helpPinned = btn; }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideHelp(); });
document.addEventListener('scroll', hideHelp, true);  // the icon moved away from the overlay
