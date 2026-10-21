# VRAM Budgeter

A browser tool for planning how the 64 KB of SNES / Super Famicom VRAM is shared between sprite tiles,
BG tiles and BG maps. You enter where each block lives and how big it is. The tool draws the whole VRAM
as a grid, flags overlaps and hardware alignment mistakes, and keeps a running budget.

There's nothing to install and no build step. It's plain HTML, CSS and JavaScript.

## Running it

Open `index.html` in a recent browser (Edge, Chrome or Firefox).

- **Internet** is only needed for the Google Fonts (DotGothic16 for the grid addresses, Archivo for the
  logos). Offline, the page still works and falls back to system fonts.
- **Your work is saved automatically** in the browser (`localStorage`) and comes back the next time you
  open the page in the same browser. To move a budget to another browser or machine, or to keep several
  versions, use **Save** / **Load** for a `.json` file or **Copy** / **Paste** for the clipboard (see [Saving and sharing a budget](#saving-and-sharing-a-budget)).

## Units: everything is in words

All addresses, offsets and sizes are **VRAM word addresses**, the same units the PPU registers use
(`$2116`, `OBSEL`, `BGnSC`, `BG12NBA`/`BG34NBA`).

| | Words | Bytes |
|---|---|---|
| Whole VRAM | `$0000`–`$7FFF` | 64 KB |
| One grid cell | `$10` | 32 (one 4bpp 8×8 tile) |
| One grid row | `$100` | 512 |
| 2bpp / 4bpp / 8bpp 8×8 tile | `$08` / `$10` / `$20` | 16 / 32 / 64 |
| 32×32 map | `$400` | 2 KB |

Hex fields accept `$1234`, `0x1234` or `1234`. Values are tidied up to `$1234` when you leave the field.
Fields start empty. A block is placed once it has an Address and a Size (maps: an Address); an
empty Offset counts as 0. Text that isn't valid hex gets a red border, and the field counts as empty
until you fix it.

## Screen layout

```
┌──────────────────────────────────────────────────────────┬──────────────┐
│ VRAM BUDGETER                                  ANTIHERO  │ ◯ Condensed  │
├───────────────────────────────┬──────────────────────────┤ $00 $10 … $F0│
│ MODE                          │ USAGE                    │ $0000 ■■■■■■ │
│ SPRITES   (SPR, SPR_EX)       │ STATUS                   │ $0100 ■■■■■■ │
│ BACKGROUNDS (BG1–BG4)         │ BUDGET                   │   …          │
└───────────────────────────────┴──────────────────────────┴──────────────┘
      configuration                  results                  VRAM grid
```

The header always stays at the top. The configuration and results columns scroll separately. On narrower
windows the results move under the configuration. Below 860 px wide, the grid goes on top.

Every field has a small **ⓘ** button. Hover or focus it for an explanation. For dropdowns, the explanation
lists what each choice means and what it costs. Click to pin the overlay open; Esc or a click elsewhere
closes it.

## Configuration

### Mode

The **Mode** dropdown sets the graphics mode (`BGMODE`, Modes 0–6). It decides which BG layers exist and
their tile format. Layers the mode doesn't have are hidden. Changing the mode resets each BG's tile format
to the mode's.

| Mode | Layers |
|---|---|
| 0 | BG1–BG4, all 2bpp |
| 1 | BG1 4bpp, BG2 4bpp, BG3 2bpp |
| 2 | BG1 4bpp, BG2 4bpp (offset-per-tile) |
| 3 | BG1 8bpp, BG2 4bpp |
| 4 | BG1 8bpp, BG2 2bpp (offset-per-tile) |
| 5 | BG1 4bpp, BG2 2bpp (hi-res) |
| 6 | BG1 4bpp (hi-res, offset-per-tile) |

Mode 7 is listed but not supported yet.

The **Copy**, **Paste**, **Save**, **Load** and **Reset** buttons sit above the Mode box. **Reset** asks for confirmation,
then clears the budget back to empty fields.

### Sprites: SPR and SPR_EX

The two sprite tables: tile names `$000–$0FF` (SPR) and `$100–$1FF` (SPR_EX). Each one has a checkbox.
An unchecked table is dimmed and left out of the budget.

| Field | Meaning | Rule checked |
|---|---|---|
| Address | Base of the table (`OBSEL`) | SPR: multiple of `$2000`. SPR_EX: SPR + `$1000`/`$2000`/`$3000`/`$4000` (name select) |
| Offset | Where your data starts inside the 256-tile sheet | Should be a whole number of tiles (`$10` words) |
| Size | Words of 4bpp tile data | Offset + size ≤ `$1000` (256 tiles) |

### Backgrounds: BG1–BG4

Each layer has a checkbox. Unchecking it collapses the card and removes the layer's tiles and map from the
budget; its values are kept for when you turn it back on. Next to the layer name is the **tile format**
(2/4/8bpp). It is read-only: the selected mode sets it, so pick another mode to change it.

**Tiles**

| Field | Meaning | Rule checked |
|---|---|---|
| Address | Character base (`BG12NBA` / `BG34NBA`) | Multiple of `$1000` |
| Offset | Data starts at base + offset | Should be a whole number of tiles |
| Size | Words of tile data | Offset + size within the 1024 tiles a map can reach from the base |

With an offset, map entries have to add *offset ÷ words-per-tile* to their tile numbers. The card's info
line spells this out, for example "tile numbers start at #128 ($080)".

**Map**

| Field | Meaning |
|---|---|
| Address | Map base (`BGnSC`). Must be a multiple of `$400` |
| Size | `32x32` (`$400` words), `64x32` / `32x64` (`$800`), `64x64` (`$1000`) |
| Tile size | `8x8` or `16x16` per map entry. Changes the pixel area the map covers, not its VRAM cost. Modes 5/6 always use 16-px-wide tiles |
| Usage | How much of the map memory is really used for mapping (see below) |
| Start / End | The used range as offsets from the map base, End included. Editable only with Usage = Custom |

**Map usage** lets part of a map's memory hold other data:

- **Full**: the whole map is used.
- **Top**: only the first half is used.
- **Bottom**: only the second half is used.
- **Custom**: you set Start and End. Switching to Custom pre-fills them with the previous range.

The unused (spare) part is drawn **hatched** in the map's colour. It isn't counted as used, and other
blocks may sit there without causing an overlap. For a `64x32` map, the halves are the left and right
screens.

### Colours

Every block has a colour swatch. Click it to pick the colour used on the grid and in the Budget table.

### Info lines

Under each card, a summary shows the real range, tile count, size in bytes and KB, and for maps the
tile size, pixel area and any spare range. For example:

```
Tiles $0000–$1FFF · 512 tiles · 16384 bytes (16 KB)
Map $5000–$53FF · 32x32 · 2048 bytes (2 KB) · 8x8 tiles → 256x256 px
Used $5000–$51FF · 1024 bytes (1 KB) · spare $5200–$53FF
```

## The VRAM grid

- **16 columns × 128 rows.** Each cell is `$10` words (32 bytes), so each row is `$100` words. The column
  headers give the offset within the row and the row labels give its base address. `$x000` rows are
  bold and separated by a gap.
- **Colours** show which block owns a cell. A cell shared by two blocks is split into stripes. A
  **hatched** cell is the spare part of a map.
- **Blinking red** cells are overlaps.
- **Hover** a cell to see its address range and owner(s).
- **Condensed view** (switch above the grid) squeezes the row height so all of VRAM fits the window
  height. The grid keeps the same width. The choice is remembered.
- **Target buttons** (⌖ at the top right of each card; **Tiles** and **Map** on BG cards) scroll the grid
  to that block and make its cells pulse. Only the cells really used are highlighted, so a Top/Bottom
  map pulses its used half only.

## Results

### Usage

Total VRAM really used, in KB and %, with a bar that turns orange from 90 % and red at 100 %. Every word
counts once, even where blocks overlap, and spare map space isn't counted.

### Status

Every problem found, errors first, then warnings:

- **Errors**: overlaps between blocks, misaligned bases (sprites `$2000`, BG tiles `$1000`, maps
  `$400`), an SPR_EX address that isn't a legal name-select gap, sprite data beyond the 256-tile sheet,
  BG tiles beyond the 1024 reachable tiles, blocks running past `$7FFF`, and an invalid
  Custom map range.
- **Warnings**: an offset or size that isn't a whole number of tiles, a tile format that doesn't match
  the mode, and SPR_EX enabled without SPR.

Click a message to scroll the grid to the address it refers to.

### Budget

One row per enabled block:

| Column | Meaning |
|---|---|
| Size | VRAM allocated to the block (for maps, only the used part) |
| Tiles (used / max) | Tiles that fit in the size / tiles the hardware can address from the base (256 per sprite sheet, 1024 per BG), minus the offset |

Maps show their size and usage instead of a tile count. **Total allocated** adds up every row, so
overlapping space is counted twice. Usage above counts it once.

### Init code

Ready-to-paste source for the current budget, regenerated on every change. **Copy** puts it on the
clipboard. The dropdown picks the output format. It defaults to ca65, and your choice is remembered:

| Format | Equates | Routine |
|---|---|---|
| **ca65 (cc65)** | `NAME = $6000` | `.proc InitVRAMLayout` … `.endproc`, with `.a8` |
| **WLA-DX** | `.DEFINE NAME $6000` | `InitVRAMLayout:` label (put it in one of your code `.SECTION`s), `.ACCU 8`, absolute `sta $2105.w` |
| **PVSnesLib (C)** | `#define NAME 0x6000` | `void initVRAMLayout(void)` writing the registers directly. Call it after `consoleInit()` and `setMode()`, with the screen off, since it overrides what they set |

All three contain the same values:

- **Equates**: for each enabled block, `*_ADDRESS` is the VRAM word address where its data should be
  copied, and `*_SIZE` is its size in **bytes** (ready for a DMA count). Blocks: `VRAM_SPR_TILES`,
  `VRAM_SPR_EX_TILES`, `VRAM_BGn_TILES` (base + offset) and `VRAM_BGn_MAP` (for Top/Bottom/Custom maps,
  only the used part).
- **`InitVRAMLayout`**: a `.proc` that writes `BGMODE` ($2105, including 16×16 tile bits), `OBSEL`
  ($2101), `BGnSC` ($2107–$210A), `BG12NBA`/`BG34NBA` ($210B/$210C), `TM` ($212C, enabled layers and
  OBJ) and `VMAIN` ($2115 = $80).

Call it during forced blank, with the data bank able to reach `$21xx`. The OBSEL sprite-size bits
(5–7) are left at 0 (8×8 / 16×16); set your own. If Status reports errors, the code starts with a
warning line.

## Saving and sharing a budget

- **Copy** puts the whole budget on the clipboard as JSON.
- **Paste** reads a budget from the clipboard and replaces the current one. The browser may ask for
  clipboard permission the first time.
- **Save** writes the budget to a `.json` file. In Edge and Chrome you get a "Save as" dialog to pick the
  folder and name. Other browsers download `vram-budget.json`.
- **Load** opens a `.json` file and replaces the current budget, with the same checks as Paste.

If clipboard access is blocked, Copy shows the JSON in a box to copy by hand, and Paste asks you to paste
it into a box.

The JSON is meant to be readable and hand-editable. Addresses are written SNES-style:

```json
{
  "app": "VRAM Budgeter",
  "version": 1,
  "mode": 1,
  "regions": {
    "SPR":  { "enabled": true, "addr": "$6000", "offset": "$0000", "size": "$1000", "color": "#ff6b6b" },
    "BG1T": { "enabled": true, "addr": "$0000", "offset": "$0000", "size": "$2000", "bpp": 4, "color": "#4dabf7" },
    "BG1M": { "addr": "$5000", "mapSize": "32x32", "tileSize": "8x8", "usage": "full",
              "useStart": "$0000", "useEnd": "$03FF", "color": "#1971c2" }
  }
}
```

Region keys are `SPR`, `SPR_EX`, and `BG1T`…`BG4T` (tiles) and `BG1M`…`BG4M` (maps). When pasting,
missing fields fall back to the defaults, values of the wrong type are ignored, and addresses may be
`"$1234"` strings or plain numbers. Pasted text that isn't a budget is rejected and the current budget is
kept.

## A typical workflow

1. Pick the **Mode**.
2. Turn off the sprite tables and BG layers you don't use.
3. For each block, set **Address** on a legal boundary, then **Size**. Use **Offset** to place data
   inside an aligned base.
4. For maps, choose **Size**, **Tile size** and **Usage**. Use Top/Bottom/Custom when part of the map
   memory holds other data.
5. Fix everything in **Status** until it reads "No conflicts — layout is valid", and check the
   **Budget** for tile headroom.
6. **Save** the result as a `.json` file next to your project (or **Copy** it).

## Files

| File | Contents |
|---|---|
| `index.html` | Page structure: header, configuration, results, grid |
| `style.css` | Theme and layout. Colours and the grid cell size (`--cell`) are variables at the top |
| `app.js` | State, validation, grid rendering, budget, copy/paste |
| `help.js` | Text of the ⓘ help overlays. Edit it to reword any help |
| `fonts/` | Optional local font files (`SNES.ttf`) |
| `VRAM_Budgeter.md` | The original specification |

## Known limitations

- Mode 7 isn't supported yet.
- In Modes 2, 4 and 6, the offset-per-tile table is read from BG3's map, which isn't budgeted.
- With 16×16 tiles, a map entry also uses tiles N+1, N+16 and N+17. This isn't checked against the end of
  the tile data.
- The Detail View from the specification isn't implemented yet.
