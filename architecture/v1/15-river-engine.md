# A dedicated river engine — design note

> **Superseded in direction by `16-water-as-objects.md` (Batch 14, WP-40 … WP-43).** The analysis
> below stands and is why `16` exists — but **its recommendations no longer do.** `16` reaches
> §1.1 and §1.2 from the opposite side: water becomes a substance subtracted from land, so there
> is no mouth for a stroke to cross and a union has no trunk and no tributary. Both defects stop
> being *representable* rather than being mitigated. **Do not take §4's M1 or M3** unless Batch 14
> is abandoned at its evaluation (`16` §10), in which case this document is the alternative that
> was not taken and §5's network model is back on the table.
>
> **What `16` does not deliver is §5's topology**, and it closes **H2 permanently** (`16` D7):
> width became an artistic choice, so nothing will ever make it accumulate downstream. Of §6's
> five decisions, **N3 and N4 are answered** by `16` (ADR-47 and `16` D6), **N1 and N2 are moot**
> — there is no graph to shape and no derived width to govern — and **N5 alone is still open**
> (`16` D11).

**Status: not scheduled, and now unlikely to be.** No package points at it and nothing in the
build order depends on it. It exists because WP-29 and WP-34 shipped two visible defects whose
real cause is structural, and the owner asked for the analysis to be written down before it is
forgotten. It is kept because a rejected alternative that is still legible is worth more than one
that was deleted — and because Batch 14 is experimental, so this may yet be the design that ships.

Everything below marked **hypothesis** is exactly that: reasoning from the code and from two
screenshots, not from a measurement or a driven check. It is written to be falsified.

---

## 1. What is actually wrong

Two defects, both seen by looking at the result rather than by any test failing.

### 1.1 A line runs across the river mouth

The river reaches the sea and a thin dark stroke crosses it, so the mouth reads as dammed.

**This one is fully understood — it is not a hypothesis.** `drawLandmass` strokes the entire
`landmass.path` with `PALETTE.coast` at `lineWidth = 3`
([draw.ts:88-91](../../src/canvas/draw.ts#L88-L91)). A stroke straddles the path it follows, so
1.5 map units of it lie **outside** the land polygon. WP-34 clips the river to that same polygon
([river.ts](../../src/engine/river.ts), `riverOutline`), so the river's mouth stops exactly at the
path — covering the stroke's inner half and leaving its outer half painted across the opening.

Rivers draw above terrain (ADR-15), so this is not a z-order problem. The river simply stops
1.5 units short of covering the line it needs to break.

### 1.2 A tributary wider than its trunk looks wrong

WP-29 buries a tributary's end by overshooting the trunk's centreline by *the trunk's* local
half-width. When the tributary is the wider of the two, its rounded mouth is wider than the trunk
it lands in, so it bulges out of the trunk's far bank — a blob threaded onto a string.

The overshoot is correct arithmetic for the case the design imagined (a small tributary meeting a
larger trunk) and produces nonsense for the inverse.

**But the inverse is the real problem, and it is not a drawing bug.** A tributary *cannot* be
wider than the river it flows into — water does not shrink downstream. The picture looks wrong
because the model permits a state hydrology does not.

---

## 2. The structural cause

> **A river is an independent filled ribbon that knows nothing about any other river.**

That is ADR-14, and for P0 it was the right call — it kept rivers out of the boolean terrain
engine entirely. Every consequence below follows from it:

| Symptom | Follows from |
|---|---|
| the coast line crosses the mouth | terrain cannot know a river ends there, so its stroke cannot break |
| a fat tributary on a thin trunk | width is per-object, so nothing makes it accumulate downstream |
| the mouth had to be faked with control points (WP-29) | there is no "mouth" in the model, only a last point |
| the round cap needed a flag it could not have (`13` D6) | there is no "this end terminates on something" either |
| a confluence is a coincidence of overlapping fills | there is no junction, only two shapes that touch |

Each of those was patched locally and each patch was reasonable on its own. Together they are the
shape of a missing abstraction.

---

## 3. Hypotheses

**H1 — the mouth defect is a stroke-coverage problem, not a clipping one.** Clipping the river to
a polygon dilated by half the coast stroke would remove the line entirely, with no change to the
coastline or to terrain. *Falsify by:* dilating the mask by 1.5–2 map units and looking. If a
line remains, something else is drawing it.

**H2 — river width belongs to the network, not to the object.** If width were derived from
position in a drainage graph (a Strahler-style order, or simply accumulated from upstream), a
tributary could not be wider than its trunk and §1.2 would be unrepresentable rather than merely
avoided. *Falsify by:* finding a map where a user legitimately wants a wide stream joining a
narrow one — a canal, a distributary, a delta arm. Those exist, so the rule may need to be a
default rather than an invariant.

**H3 — the coastline should break at a mouth, and only a network can say where.** Real
cartography interrupts the shore stroke at a river mouth. That needs terrain's *drawing* to know
about rivers, which is the reverse of the dependency ADR-41 just accepted (rivers depending on
terrain). Doing it without a network model would mean the terrain layer scanning every river on
every draw. *Falsify by:* mocking up a coast stroke broken at the mouth and confirming it reads
better — it is an art claim and has not been tested.

**H4 — the current model cannot express a delta, a braided channel, or a lake inlet/outlet
pair**, and those are the next three things anyone drawing a fantasy map will want. Untested; it
is an inference from the data model, where a river is a point list with one width.

---

## 4. What could be done now, cheaply

> **Overtaken by Batch 14 — do not build these.** M1 and M3 mitigate defects that `16` removes
> structurally, so taking them now would be work thrown away at WP-40, and M2 patches a state
> `16` makes unrepresentable. They are kept as the cheap fallback if the evaluation in `16` §10
> rejects the water model. **M4 is what is actually happening**: nothing is being done to these
> defects until Batch 14 either fixes them or is abandoned.

Ordered by cost. None of these needs the engine.

**M1 — dilate the clip mask (fixes §1.1).** Offset the land polygon outward by half the coast
stroke before intersecting. `clipper-lib` is already a dependency and already does offsets for
coastal rings. Roughly one function and a constant. **Risk:** the dilation is in map units while
the stroke is `lineWidth 3` on a scaled context — the two must be reconciled or the fix will be
right at one zoom and wrong at another.

**M2 — bury a tributary by the *larger* of the two half-widths (softens §1.2).** One `Math.max`.
It stops the mouth bulging out of a thin trunk, at the cost of the tributary visibly crossing it.
A patch over a modelling error, and it should be labelled as one.

**M3 — clamp a river's width to its snap target at draw time.** If the end snapped to another
river, draw it no wider than that river. Cheap, and it makes the picture obey H2 without any
graph. **This is the one worth doing if only one is done** — it removes the odd case rather than
disguising it.

**M4 — do nothing and accept both.** Legitimate. Neither defect destroys a map, and the owner has
already said the current state is acceptable for now.

---

## 5. What a dedicated engine would look like

A sketch, not a specification. Enough to argue with.

**A river network, not a river.** One scene object holding nodes and edges rather than N objects
holding point lists. A node is a source, a confluence or a mouth; an edge is a reach with its own
control points.

**Width is derived, never authored.** Each reach takes its width from accumulated upstream count
or catchment order, with a per-network scale the user drives. §1.2 stops being possible.

**A mouth is a modelled thing.** It knows what it terminates on — coast, lake, another reach, or
nothing — which is what `13` D6 wanted and could not have. WP-34's clip settled D6 by accident;
a network settles it by design.

**The coastline is drawn from terrain minus mouths.** With mouths enumerable, breaking the coast
stroke is a subtraction rather than a scan.

**What it must not break:** the scene stays one serializable document (ADR-07); rivers stay out
of the boolean terrain engine for their *own* geometry (ADR-14 — the mask in ADR-41 is drawing,
not geometry); and a river must remain hand-editable point by point, because ADR-01's promise is
that generated content is ordinary editable geometry.

**What it costs:** a `schemaVersion` bump and a real `migrate()` — every existing river becomes a
one-edge network. That is the reason this is a note and not a package: the migration is the
expensive part, and it should be paid once, for a design that is settled, not twice.

---

## 6. Decisions that would have to be settled first

- **N1** — is a network one scene object or a layer of linked objects? Selection, undo and the
  transform stack all assume the latter shape today.
- **N2** — is derived width an invariant or a default a user can override? H2's counter-examples
  (canals, distributaries) suggest a default.
- **N3** — does the coast stroke break at a mouth, and does that put a rivers dependency in the
  terrain layer's cache key? ADR-41 accepted the mirror of this and paid for it explicitly.
- **N4** — do lakes participate? A lake is a hole in a landmass today, not a water body
  (`01-system-design.md` §15 defers first-class water bodies), so an inlet/outlet pair has
  nowhere to attach.
- **N5** — does the generator produce networks? It does not generate rivers at all today, also
  deferred in §15. If it ever does, it wants the graph, not the ribbons.

---

## 7. Why this is a note and not a batch

Three of the five decisions above depend on features already deferred to a later version —
first-class water bodies, auto-generated rivers. Designing the engine before those are settled
would mean designing it twice.

The two defects it would fix are cosmetic and bounded, and **M1 and M3 in §4 address the visible
half for a fraction of the cost**. The right moment for the engine is when someone wants a delta,
a braided channel, or generated rivers — at which point the network stops being an improvement
and becomes the only way to get the feature at all.

### What happened instead

**The reasoning above held, and the conclusion was overtaken.** §7 assumed the only two options
were *build the graph* or *patch the symptoms*. There was a third: change what a river **is**.
`16-water-as-objects.md` makes water a substance subtracted from land, which removes both defects
without answering N1 or N2 and without waiting for the deferred features that made this document
decline to become a batch.

**It is the cheaper half of the same insight.** This note correctly identified that the defects
share one cause — a river that knows nothing about anything else. `16` fixes that by putting every
river into one shared geometry, which is a weaker relationship than a graph and enough for the
picture. What it buys is the look; what it forgoes is the topology, and this document remains the
only place that topology is designed.

**So the sentence above is still the right test, narrowed:** the right moment for the engine is
when someone wants a **delta, a braided channel, or generated rivers** — and `16` helps with none
of those. If that day comes, start here.
