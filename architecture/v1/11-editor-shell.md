# The editor shell — menu bar, and a rail that holds one idea

**Batch 5.** Design document for **WP-23**. Decision: **ADR-36**.
**Prerequisite:** WP-13 (the real UI) and WP-22 (the gallery this batch moves behind a menu).

Nothing here touches the scene contract, the geometry pipeline, or a pointer-driven
interaction. It is the chrome *around* the editor, and it is the one document in this series
that decides nothing about what a map is.

---

## 1. What is wrong

The right rail is one scrolling column holding five unrelated concerns:

| Section | What it actually is |
|---|---|
| Layers | live state you glance at constantly while painting |
| Map settings | render settings you tune while watching the canvas |
| Generator | a one-shot command with seven parameters |
| Map | document actions — new, open, reset, rename |
| Canvas | a destructive document action wearing three chips |

`MapPanel.tsx` is 300 lines and scrolls on a laptop. The generator alone is ~95 of them, and
it duplicates a **Generate** button that already sits in the toolbar — the same command in two
places, which is what a rail looks like when it has become the place things go when there is
nowhere else.

The toolbar has the mirror problem: brand, document title, tool modes, undo/redo, theme and two
actions in one wrapping row. ADR-28 fixed the *tools* in that row and left the chrome around
them alone.

**The diagnosis is grouping, not rendering.** Every control here works. They are filed by the
order they were built in rather than by what kind of thing they are.

## 2. The rule this document applies

> **A menu holds commands and rarely-changed settings. A rail holds live state you steer while
> looking at the map.**

Everything below follows from that one line. It is also the test for anything added later: if a
new control is something you set and forget, it is a menu item; if it is something you drag
while watching the canvas change, it belongs in a rail.

Two consequences worth stating, because they are where the rule earns its keep:

- **Ring count and ring gap stay in the rail** even though they look like settings. They
  re-derive the coastal bands live — you drag them *at* the map. Sea level and land amount do
  not: they only ever apply on the next Generate, so they belong in the dialog.
- **Bring forward / Send back / Delete appear in both places.** They are high-frequency during
  a selection, so the rail keeps them; they are also undiscoverable, so the Edit menu lists
  them with their shortcuts. This is deliberate duplication of a *command*, which is what menu
  bars are for — unlike the two Generate buttons, which were duplication by accident.

## 3. The grouping

```
Map ▾                 Edit ▾                    View ▾              Help ▾
────────────────────  ────────────────────────  ──────────────────  ─────────────
New map               Undo              Ctrl+Z  ✓ Tool options      Keyboard
Open Map…             Redo        Ctrl+Shift+Z  ✓ Layers panel      shortcuts…
────────────────────  ────────────────────────                      About
Canvas size        ▸  Bring forward
Reset canvas…         Send back
────────────────────  Delete selected      Del
Generate world…
Export image…
```

- **Theme stays a button**, on the menu bar, not a menu item. It is one click today and a menu
  item would make it two. A menu bar is for grouping *many* commands, not for hiding the one
  that is already a single control.
- **`Canvas size ▸`** is a radio submenu — landscape / square / portrait — and keeps the rule
  [MapPanel.tsx:270](../../src/ui/MapPanel.tsx#L270) documents: **re-picking the size you are
  already on is a no-op, not a reset.** A radio item makes that structural rather than a guard,
  since a radio group's current value is not a command.
- **`Open Map…`** is the gallery WP-22 built, renamed from "My maps". P2 adds cloud maps to the
  same dialog (ADR-33), and "my maps" will then be ambiguous about *whose* and *where*.
- **No `Rename`.** The map title becomes an inline input in the menu bar, which is where a
  document's name lives in every editor and removes a command instead of adding one.

**The right rail keeps two sections:** the layer list, and the four render settings you tune
against the canvas — parchment, coastal rings, ring count, ring gap — retitled **Appearance**.
Nothing scrolls at 900 px of viewport height.

## 4. Layout

Two fixed rows. The bottom autosave strip goes away and `saved` moves into the menu bar, so
total chrome height is unchanged.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [M] │ Map  Edit  View  Help    Ardenmoor Coast ✎    saved  ☾  Generate  [Export] │
├──────────────────────────────────────────────────────────────────────────────────┤
│ ▣ Select   ≋ Sea brush │ Terrain Mountains Forests Rivers Icons Labels     │ ↶ ↷ │
├────────────────┬────────────────────────────────────────────────┬────────────────┤
│ TOOL OPTIONS   │                                                │ LAYERS         │
│ · terrain      │                                                │  labels      0 │
│ [Brush] [ Sea ]│                                                │  icons       2 │
│ Brush size     │                                                │  rivers      1 │
│  ───●─────  240│                  c a n v a s                   │  mountains  38 │
│ Coast detail   │                                                │  forests    64 │
│  ───●─────  0.4│                                                │  terrain     3 │
│ BIOME TO PAINT │                                                │                │
│ ●grass  ●arid  │                                                │ APPEARANCE     │
│ ●snow  ●marsh  │                                                │  Parchment  ◉  │
│ ON OVERLAP     │                                                │  Rings      ◉  │
│ [apart][merge] │                       zoom 62% · 3 landmasses  │  Count ──●─  4 │
└────────────────┴────────────────────────────────────────────────┴────────────────┘
```

**Row 2 is today's toolbar with the chrome removed.** ADR-28's two axes — mode (Select, Erase)
and create (the six layers) — are untouched by this batch. Batch 6 changes what Erase *does*;
it does not move it.

## 5. Three behaviour changes inside WP-23

### 5.1 The generate confirm folds into the generate dialog

Today `requestGenerate` raises an `AlertDialog` only when the scene has objects (ADR-21). With
the parameters in a dialog of their own, a second stacked dialog is noise.

**Decision:** the generate dialog carries the warning itself. When the scene has objects it
shows the "this replaces everything, undoable in one step" line and its primary button reads
**"Replace map"**; on an empty scene there is no line and the button reads **"Generate world"**.

ADR-21's rule is kept exactly — the ask still happens only when there is something to lose. What
goes away is a modal on top of a modal, and `confirmGenerate` state in `App`.

### 5.2 The sea-level gate stays; the switch that gates it becomes visible

The Advanced drawer has a **"Set sea level by hand"** toggle above a **Sea level** slider that
is `disabled` until the toggle is on
([MapPanel.tsx:160-171](../../src/ui/MapPanel.tsx#L160-L171)). The gate is correct and stays:
the slider genuinely does nothing until the override is on, and a live slider that silently
means "auto" would be a control that lies about what it edits — exactly what I9 exists to
prevent.

**The real defect is that you cannot see the switch.** `switchRoot` fills its unchecked state
with `bg-sink` and gives it no border ([variants.ts](../../src/ui/variants.ts)), and `--sink`
sits a hair away from `--panel` in both themes — `#E7ECE5` on `#FBFCFA` in light, `#131A19` on
`#18201F` in dark. An off switch is very nearly invisible against the panel it sits on, which is
why the slider below it reads as permanently dead: nothing visible explains why.

**Decision:** fix the switch, not the slider. `switchRoot` gets a visible border and an
unchecked fill that clears **3:1 against the panel** — the WCAG 2.2 non-text contrast minimum
for a UI component, which a toggle is. The thumb is checked against both track states at the
same time.

**This is a root-cause fix, not a sea-level fix.** `Toggle` ([controls.tsx:83](../../src/ui/controls.tsx#L83))
is the only switch in the app, so every toggle in the rail and the dialogs — parchment, coastal
rings, river taper, sea level — is invisible in the same way, and one variant change fixes all
of them.

**What the slider is for, stated because it is not obvious.** Normally the coastline threshold
is *derived*: [generate.ts:74](../../src/engine/generator/generate.ts#L74) takes the
`1 - landAmount` quantile of the elevation field, so "40 % land" means 40 % land. Overriding it
pins the shoreline at an absolute height instead, and costs two things: land amount stops
meaning what it says, and the mountain and tree bands move with it —
[scatter.ts:98-103](../../src/engine/generator/scatter.ts#L98-L103) computes
`ridge = sea + (peak - sea) × 0.45` and `treeLine = sea + (peak - sea) × 0.62`, so raising sea
level compresses the band peaks and woodland live in. That is why it defaults to `null` and sits
in Advanced. The rail never said any of this; the dialog's hint line does.

### 5.3 The seed becomes a shareable world code

Generation is deterministic and tested — one seed gives one world
([generator.test.ts:394](../../src/engine/generator/generator.test.ts#L394)); elevation,
moisture and scatter each run a `mulberry32` stream derived from it.

**But the seed is four of the nine inputs `generateWorld` reads**, and three of the rest —
`seaLevel`, `mountainDensity`, `forestDensity` — are session-only editor state, deliberately
outside the schema ([editorStore.ts:80](../../src/state/editorStore.ts#L80)). A bare copyable
seed would reproduce nothing whenever another knob differed, and would look broken rather than
under-specified.

**Decision:** the dialog exposes one **World code** field — editable, with a copy button —
carrying every input that defines the world, fixed-order and dash-joined behind a version tag:

```
w1-483920104-0.40-0.60-single-auto-0.50-0.50
    seed      land  rough  type   sea  mtn  forest
```

- **Human-readable on purpose.** No base64, no JSON. Someone can see their seed in it, and a
  code that arrives mangled by a chat client is diagnosable by eye.
- **Pasting sets every control in the dialog**, so what you see is what you pasted. There is no
  hidden state to disagree with the sliders.
- **A malformed or wrong-version code is rejected with a toast and changes nothing.** Fail
  loudly — ADR-30's parser rule, which exists because the previous silent-fallback parser cost
  a day.
- **Canvas size and `coastDetail` are out.** They belong to your map rather than to the world
  recipe: a code should not resize someone's canvas. The dialog says so in one line, so the
  omission is a promise rather than a gap.

New `src/engine/generator/worldCode.ts`, ~30 lines, with a round-trip test.

## 6. What this costs

| File | Change |
|---|---|
| `src/ui/MenuBar.tsx` | **new**, ~170 lines — Radix `DropdownMenu`, plus the title input, save status, theme, Generate, Export |
| `src/ui/dialogs.tsx` | `GenerateDialog` + `ShortcutsDialog` — this file is already the home of the modals |
| `src/engine/generator/worldCode.ts` | **new**, ~30 lines |
| `src/ui/MapPanel.tsx` | 300 → ~110 |
| `src/ui/Toolbar.tsx` | 231 → ~130 |
| `src/state/editorStore.ts` | `deleteSelection` / `restackSelection` lifted in |
| `src/ui/ToolOptions.tsx` | calls the two store actions instead of its local copies |
| `src/ui/variants.ts` | menu variants — every class string stays in one file (`06`) |
| `src/App.tsx` | composes, owns dialog state and the two rail-visibility booleans |

**No new dependency.** `radix-ui` ^1.6.7 already ships `DropdownMenu`, imported the same way as
`Dialog` and `AlertDialog` in [dialogs.tsx:1](../../src/ui/dialogs.tsx#L1), so keyboard
navigation, Escape, typeahead, focus return and `role="menu"` all come from the primitive.
Write none of it.

**`deleteSelection` and `restackSelection` move to the store** rather than being duplicated.
They already reach for `useEditorStore.getState()` inside their own bodies
([ToolOptions.tsx:109-132](../../src/ui/ToolOptions.tsx#L109-L132)) — they are store actions
wearing a component's clothes, and the Edit menu is simply the second caller that makes it
obvious. They keep reusing `restack` ([scene/transform.ts](../../src/scene/transform.ts)),
`removeObjects`, `setLayerObjects` and `record`.

## 7. Test hooks that must survive

The `data-*` attributes are the handles the CDP recipes in `07-interaction-invariants.md` drive.
Every one keeps its exact value on whichever element it moves to — they are now menu items
rather than buttons, which changes the tag and not the selector:

`data-action="new-map" | "gallery" | "reset" | "undo" | "redo" | "theme"` ·
`data-preset` · `data-preset-active` · `data-map-title` · `data-autosave`

The title input keeps its `onKeyDown` `stopPropagation`, because `App`'s global Ctrl+Z handler
only bails on `INPUT|TEXTAREA|SELECT` and the input must not have its undo stolen.

## 8. Acceptance

- Every menu opens on click and closes on Escape, and each item runs the command it names —
  **driven input, asserting the store or the scene changed**, not a screenshot.
- `Map → New map` mints a fresh `meta.id`; `Reset canvas…` keeps it. (ADR-35's split, unchanged
  — this package only moves the buttons.)
- `Map → Canvas size ▸ portrait` raises the confirm and changes `meta.canvas` only after it;
  picking the size already active does nothing at all.
- `Map → Generate world…` runs the worker, applies as one command, and the toast undoes it. On a
  non-empty scene the button reads **Replace map** and the warning line is present; on an empty
  one, neither.
- A world code copied from one session and pasted into another produces **the same scene** —
  driven paste → generate → compare, plus a `worldCode` round-trip unit test and rejection tests
  for a garbage string and a `w2-` string.
- An **off** switch is distinguishable from the panel behind it in both themes — measured at
  **≥ 3:1**, not eyeballed — and the sea-level slider still enables only when its toggle is on.
- `Edit → Delete selected` removes objects across two layers in one undo step, matching what the
  rail's button does — same store action, so this is one check of two call sites.
- The right rail shows no scrollbar at 900 px viewport height with a generated world loaded.

## 9. Rejected

- **A single header row.** It already wraps below ~1400 px, which is most laptops, and the map
  title has no stable home in it. Two rows cost nothing once the bottom autosave strip goes.
- **Moving Appearance into the View menu as well.** Ring count and gap re-derive live; tuning
  them means holding a menu open over the map you are judging. §2's rule says no.
- **A bare copyable seed field.** Reproduces nothing when the other six inputs differ, and fails
  silently, which is worse than not offering it.
- **Persisting `seaLevel` / `mountainDensity` / `forestDensity` into the scene** so the seed
  alone would suffice. That is a `schemaVersion` bump and a `migrate()` step to make a text field
  shorter. The world code carries them instead, at the cost of nothing.
- **Keeping the generator in the rail behind a collapsible.** Smallest diff, and it leaves the
  rail owning four unrelated concerns instead of five — treating the symptom.
- **A `Rename…` command.** An inline title input is one control fewer and the convention
  everywhere else.
- **Merging the sea-level toggle into its slider** (an always-live slider reading `auto` until
  dragged). Tempting, and wrong: the disabled state is honest — the slider really does nothing
  until the override is on — and the complaint that prompted it was that the *switch* is
  invisible, not that the gate is unwanted. Fixing the slider would have left every other toggle
  in the app just as hard to see.
