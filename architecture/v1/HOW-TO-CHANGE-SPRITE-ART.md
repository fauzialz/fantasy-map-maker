# How to Change the Sprite Art

_Practical guide for replacing or adding the map's hand-drawn objects — mountains, trees and
icons. Companion to `10-hit-testing-precision.md`, which is the engineering side of the same
contract. Not a design document: this is the procedure._

---

## Short answer to "what format?"

**SVG path data — the `d` attribute only, not an `.svg` file.** You author in whatever tool
you like and paste one string per shape into
[`src/sprites/registry.ts`](../../src/sprites/registry.ts).

| Format | Usable? | Why |
|---|---|---|
| **SVG path `d` string** | **Yes — this is the format** | Drawn with `Path2D` at runtime, coloured from the theme tokens, and inlines into a single file for free |
| A whole `.svg` file | No | Two reasons, both load-bearing — see below |
| PNG / JPG / WebP | No | No theming, no crisp scale at export, and it bloats the P1 embed |

### Why not a whole SVG file

1. **Colour comes from the theme, not the artwork** (ADR-24). Sprites are filled and stroked
   with `PALETTE` values that are re-read from CSS custom properties whenever the theme
   flips, and the raster cache is dropped so they redraw. An SVG carrying its own `fill="…"`
   would be a fixed-colour object sitting in a themed map, wrong in one mode or the other.
2. **P1's embed has to render offline under a strict CSP.** `textures.ts` says it plainly:
   nothing is loaded from a URL, because a self-contained `.html` opened from `file://` must
   still draw. A path string is a few hundred bytes of source; an external asset is a fetch
   that will not happen.

So the pipeline is: **draw in a vector tool → export SVG → lift the `d` strings → paste.**

---

## Before you draw: the authoring grid

Every sprite is drawn on a **100 × 100 grid**, with the **baseline at y = 88** — that is
where the object's feet stand.

- **Your art does not need to fill the grid.** The real box is measured from the path
  (`spriteExtent`), so empty margin costs nothing and is not counted.
- **Put the feet on y = 88.** An object's `x, y` in the scene anchors *the centre-line of the
  content at the baseline*, and that anchor is also what the draw order sorts on
  ([data model §5](02-scene-data-model.md)) and what rotation spins about (invariant I1).
  Art whose feet sit at y = 70 will float; at y = 100 it will sink, and it will rotate about
  a point below itself.
- **Horizontal centring is free.** Content that is off-centre on the grid is handled —
  `spriteExtent` finds the real centre-line. `07` §4 tabulates how far off the current
  mountains are.

## The three parts of a sprite

```ts
{
  body:      "M18 88 L18 30 … Z",   // required — filled AND stroked
  highlight: "M14 -8 L20 6 …",      // optional — filled with the "lit" colour, no stroke
  detail:    "M46 88 L46 70 …",     // optional — stroked thin at 55% alpha, never filled
}
```

- **`body`** is the silhouette. **It alone defines the bounds**, so anything outside it is
  drawn but not measured — a highlight poking past the body will not enlarge the selection
  box, and after WP-21 it will not be clickable either. Keep the body the outer shape.
- **`highlight`** is the snow-cap / lit face. Filled with `PALETTE.peakLit`.
- **`detail`** is interior linework — a door, a crease. Stroked, semi-transparent.

**Do not put colours in the path data.** There is nowhere to put them; the renderer supplies
fill and stroke from the palette per sprite kind
([raster.ts](../../src/sprites/raster.ts)).

---

## Step by step

### 1. Draw it
On a 100 × 100 artboard, feet on y = 88. Draw the silhouette as one closed shape if you can
— one `body` path may contain several subpaths, but a single outline is easiest to reason
about.

### 2. Export and lift the `d` strings
Export SVG, open it in a text editor, and copy the `d` attribute of each path. You want the
string only — not the `<path>` element, not the `<svg>` wrapper.

### 3. Convert to the supported dialect  ← **the step that bites**

The paths are read by a real command walker
([`src/sprites/path.ts`](../../src/sprites/path.ts)), and it accepts a deliberately narrow
dialect: **absolute `M`, `L`, `Q`, `Z` and nothing else.**

| Command | OK? | If not, why |
|---|---|---|
| `M` `L` `Q` `Z` | **Yes** | What the assets use, and all the walker accepts |
| `C` `S` `T` (absolute) | **No** | Would parse under the old regex by luck; the walker rejects them rather than guess |
| `m` `l` `q` `c` … (**lowercase**) | **No** | Relative — the numbers are deltas |
| `A` (arc) | **No** | Flattening arcs is disproportionate when every tool can emit curves instead (ADR-30 F4) |
| `H` `V` | **No** | Shorthand, one number each |

**Design tools emit exactly the unsupported set by default** — lowercase relatives and
cubics, sometimes arcs. So convert:

- **Absolutise the path.** Illustrator, Inkscape ("Optimised SVG" with relative off), or an
  SVGO pass with `convertPathData: { forceAbsolutePath: true, makeArcs: false }`.
- **Remove arcs** — every tool can emit curves instead.
- **Expand `H`/`V`** into full `L x y`.
- **Reduce cubics to quadratics**, or accept the rejection and redraw the curve.

> **This no longer fails silently — WP-21 shipped the guard.** An unsupported command throws
> with the offending letter and the whole path in the message, and
> `src/sprites/path.test.ts` walks **every body, detail and highlight in the registry**, so
> pasting the wrong dialect turns the suite red the moment you run it. Before that guard
> existed, the failure mode was no error at all: just a selection box subtly or wildly wrong,
> discovered by feel months later. Run `npx vitest run src/sprites/` after pasting.

### 4. Paste it in
[`src/sprites/registry.ts`](../../src/sprites/registry.ts).

- **Replacing art:** overwrite the `body` / `highlight` / `detail` of the entry in place.
  Nothing else to touch — see "Does the box need reconfiguring?" below.
- **A new mountain or tree variant:** append to the `MOUNTAINS` / `TREES` array. The array
  index *is* the variant number, and `variantCount` drives the random pick, so a new entry
  starts appearing immediately.
- **A new icon:** add the name to `ICON_KINDS` **and** the sprite to `ICONS` **at the same
  position**. `iconVariant` maps the name to an index by `ICON_KINDS.indexOf`, so the two
  arrays drifting out of order silently swaps artwork between icons. This is the one place a
  mistake is quiet.

### 5. Set the drawn size, if it changed
`SPRITE_HEIGHT[kind]` is the sprite's nominal height in **map units** — how big it is on the
map, independent of the 100 × 100 authoring grid. Only touch it if the new art should read
larger or smaller than the old.

### 6. Verify
```sh
npm test          # bounds + registry tests
npm run dev
```
Then, in the app: place one, switch to **Select**, click it, and look at the frame.

- The frame should **hug the artwork**, not the 100 × 100 grid. Slack on one side usually
  means step 3 went wrong.
- Drag it, and rotate it with the stalk. It should **spin in place**, not swing along an arc
  — that is invariant I1 telling you the feet are on the baseline.
- Check both themes (the sun/moon button). The sprite recolours; if it does not, a colour got
  baked into the path.

---

## Does the box need reconfiguring when I change art?

**No — it derives itself.** `spriteExtent` measures the box from the path string, so the
selection frame, hit-testing, the eraser, the transforms and the rbush index all follow new
artwork with no table to update anywhere. That is why the measurement reads the path rather
than the rasterised bitmap (`07` §4).

**With one caveat, which is step 3.** The derivation is only as good as the parser, and the
parser is narrow. Inside the supported dialect it is fully automatic; outside it, **the walker
throws and a test goes red** — which is the whole improvement WP-21 made here. It used to be
automatically *wrong* instead, and silently.

One smaller consequence worth knowing: the box is measured from **`body` only**, so art that
lives entirely in `detail` is invisible to selection — and now also to picking, since the
silhouette comes from the same field.

## What WP-21 changed here

- Clicking uses the **silhouette to break ties** between overlapping boxes, so precise art
  gets precise picking (`10-hit-testing-precision.md`). It is a tie-break, not a filter: an
  isolated sprite still answers to a near miss.
- **Boxes got tighter**, because curves are flattened instead of measured to their control
  points. Measured on the current art: mountain 2's box shrank **27%**, trees 1 and 3 by
  17% and 15%, and every other box is unchanged because its extremes are already on-curve.
- Step 3 has a **safety net**: an unsupported command fails a test instead of mis-measuring.
- The dialect can now widen cheaply, because a real path walker exists. Arcs stay out.
