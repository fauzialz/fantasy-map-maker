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

The bounds parser currently reads the path with one regex: *take every number, pair them as
`(x, y)`*. That is correct only for absolute commands whose numbers are all coordinates.

| Command | OK? | If not, why |
|---|---|---|
| `M` `L` `Q` `Z` | **Yes** | What the current assets use |
| `C` `S` `T` (absolute) | Yes, by luck | Even number of coordinates, so the pairing survives |
| `m` `l` `q` `c` … (**lowercase**) | **No** | Relative — the numbers are deltas, so min/max is meaningless |
| `A` (arc) | **No** | Seven numbers, two of them boolean flags. Odd count mispairs everything after it |
| `H` `V` | **No** | One number each, so the pairing slips by one from there on |

**Design tools emit exactly the unsupported set by default** — lowercase relatives and
cubics, sometimes arcs. So convert:

- **Absolutise the path.** Illustrator, Inkscape ("Optimised SVG" with relative off), or an
  SVGO pass with `convertPathData: { forceAbsolutePath: true, makeArcs: false }`.
- **Remove arcs** — every tool can emit curves instead.
- **Expand `H`/`V`** into full `L x y`.

Until WP-21 item 4 lands, **a wrong dialect fails silently**: no error, no crash, just a
selection box that is subtly or wildly wrong, discovered by feel. After it lands, an
unsupported command fails a test the moment you paste it. If you are doing this before that
package, eyeball the box (step 6) with extra care.

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
parser is narrow. Inside the supported dialect it is fully automatic; outside it, it is
automatically *wrong*. That asymmetry is the single thing to remember from this document.

Two smaller consequences worth knowing:

- The box is measured from **`body` only**. Art that lives entirely in `detail` is invisible
  to selection.
- Boxes are currently a little loose because the parser counts Bézier **control points** as
  if the ink reached them. WP-21 fixes that by flattening the curves; until then, a shape
  with dramatic curve handles will box looser than it looks.

## What changes after WP-21

- Clicking uses the **silhouette** to break ties between overlapping boxes, so precise art
  gets precise picking (`10-hit-testing-precision.md`).
- Boxes get tighter, because curves are flattened rather than approximated by their control
  points.
- Step 3 gets a **safety net**: an unsupported command fails a test instead of mis-measuring.
- The dialect can then widen cheaply, because a real path walker will exist. Arcs stay out.
