# Editing an outline point by point — design note

**Status: not scheduled, and deliberately undecided. This is a note, not a work order.** No package
points at it, nothing in the build order depends on it, and **its shape depends on the outcome of
Batch 14** (`16-water-as-objects.md` §10). It exists because the request that produced Batch 14
asked for it in the same breath, Batch 14 removes the only place it currently exists, and the owner
wanted it written down before it is forgotten.

Written in the same spirit as `15-river-engine.md`: everything below marked **hypothesis** is
reasoning from the code and from one measurement, not from a driven check. It is written to be
falsified.

---

## 1. What was asked for

> When you select a river, you can see the drawing nodes and adjust them. I want that available on
> landmass select too.

Half of that sentence is the reason Batch 14 has the shape it does. Landmasses are brush-painted
and have no centre path, ever — so the nodes cannot be spline control points; they are **outline
vertices**. ADR-48 followed from it: one object kind, no stored centreline, nodes that are the
shape's own points.

The other half is this document, and it is unbuilt.

## 2. What exists today, and what Batch 14 does to it

**Rivers have point-dragging now.** WP-20 shipped it, ADR-29 specifies it, `RiverOverlay.tsx`
draws the points from `selection.riverPoints`, and it is the **top rung of I5's precedence stack**
— *"a river's control points outrank the frame's handles."*

**WP-40 deletes all of it**, because ADR-48 removes the `points` field. `16` §7 accepts that gap:
what is lost is precision, not editing, since WP-41 and WP-42 give back freehand reshaping by
brush and that is already how a coastline is edited. **Landmasses have never had draggable
points at all.**

So after Batch 14, no object in the app can be edited exactly. That is the state this note is
about, and it is the state the owner chose in order to find out whether it matters.

## 3. One measurement, and it corrects an assumption

Every earlier note in this repo — including `16` §6 — asserts that a brush-committed coastline
carries "hundreds of vertices" and that showing them all would be a hairball. **The one measured
figure says otherwise.**

`08` §4 T3 records **9.1–13.7 points per 1000 map units** after simplification at `coastDetail`.
So on a 4000×3000 canvas:

| Object | Perimeter (map units) | Points, approx |
|---|---|---|
| small island | ~1 300 | 18 |
| island, scaled 4× | ~3 300 | 30 |
| continent, half the canvas | ~8 000–15 000 | 70–140 |

**Tens to low hundreds, not hundreds.** Vertex editing is therefore considerably more tractable
than the deferral notes claim, and **proportional falloff may be a refinement rather than a
prerequisite**. That is the single most useful thing in this document: the argument that sent this
feature to its own batch was weaker than it sounded.

## 4. Four problems, none of them solved

**P1 — self-intersection, and it is the dangerous one.** Drag a vertex across another part of the
same outline and the polygon self-intersects. `polygon-clipping`, `clipper-lib` and the ring
derivation all assume simple polygons. On land that is a bad render. **On water it is worse,
because water subtracts from land (ADR-47)** — an invalid water polygon corrupts the terrain
derivation, not merely its own object. Needs a validity test on drop, or a repair pass, and
neither exists. *Falsify by:* dragging a vertex across a bay in a spike and looking at what the
boolean returns.

**P2 — the overlap policy has no single-vertex formulation.** `08` **C1** says land never overlaps
land at rest, and `08` §5's resolver works by **sliding back along the drag path** — a whole-object
gesture, replayed at fraction *t*. That has no meaning when one point moved. A vertex dragged into
a neighbouring landmass is currently unhandled, and C1 is precisely what makes terrain hit-testing
cheap enough to need no topmost rule. Water inherits the same constraint by parity (`16` C1).

**P3 — simplification would erase the edit.** WP-16 established that geometry is re-simplified, and
resampled on scale-up, after a transform. Run that after a vertex drag and the user's point can be
shed as redundant. So a manually placed point has to be **sticky** — which means either knowing
which points a human placed (new state, and `02` §4 has nowhere to put it without a bump) or a
rule that manual editing switches that object out of auto-simplification (no new state, but the
object's density then drifts from `coastDetail` and nothing says so).

**P4 — handles are unhittable at fit zoom.** A 4000-unit canvas is a few hundred screen pixels
wide. 140 vertices along a coast sit closer together than a fingertip, so handles need
zoom-dependent culling and screen-constant sizing under **I8** — the same problem WP-29 solved for
snap thresholds by working in screen space. Culling raises its own question: a handle that is not
drawn is a point the user cannot move, and nothing would say why.

**P5 — a new rung in I5, on top of one Batch 14 just removed.** `07` §I5's precedence stack already
orders control points, frame handles, frame interior and marquee. Vertex editing adds a rung and
almost certainly a **mode**, because vertices and frame handles collide at exactly the corners
where a handle sits. `07` records seven bugs from getting this stack wrong; this is not a place to
improvise.

## 5. Two shapes it could take

**A — vertex handles, with proportional falloff.** What was asked for. Select an object, see its
points, drag one; neighbours follow with a radius and a falloff so a coastline moves as a stretch
rather than a spike. Exact, familiar from every vector tool, and it answers the request literally.
Carries P1–P5 in full.

**B — a coast sculpt brush.** No handles at all: a radius, a direction, and a falloff, pushing the
boundary in or out under the cursor. **Hypothesis: this is what a user actually wants on a
coastline**, and proportional falloff in shape A is already approximating it — except shape A makes
you acquire a handle first, which is P4.

It also disposes of most of the list. No handles means no hit-target problem and no zoom culling
(P4 gone). It composes with the brush-first design of every other tool in the app, and the hover
ring from WP-24 is already the right cursor. P1 remains, P2 remains, and P3 becomes easier because
a sculpt result is resampled by nature.

**What B cannot do is be exact.** And exactness is the thing Batch 14 takes away, so if the
evaluation says exactness is what is missed, B does not answer the complaint.

*Falsify B by:* using WP-41 and WP-42 for a while. Brush-shaped water editing is a rough version of
B already, and if it turns out to be enough, B is the whole feature.

## 6. What has to be settled first

- **V1** — does this arrive at all, or did brush editing turn out to be sufficient? **Cannot be
  answered before Batch 14 is used.** This is the dependency the whole note hangs on.
- **V2** — shape A, shape B, or both? A and B are not exclusive; they are exact and freehand, and
  the app may want one of each. Two tools is the honest answer and also the expensive one.
- **V3** — what happens to an edit that makes a polygon invalid: reject the drag, repair the
  result, or allow it and let the renderer cope? P1.
- **V4** — does C1 still hold under vertex editing, and if so what replaces slide-back? P2.
- **V5** — is a manually placed point sticky, and where is that recorded? P3 — and if the answer
  needs a field, it needs a `schemaVersion` bump, which is the sort of thing that should ride an
  existing bump rather than earn its own.
- **V6** — does this apply to labels and sprites too, or only to path objects? They have anchors
  and boxes, not outlines, so almost certainly only path objects — but I9's two-model split is the
  place that question gets answered, not here.

## 7. Why this is a note and not a batch

**Because the owner chose to feel the gap first.** Batch 14 removes point-dragging and gives back
freehand brush editing on both substances. Building the replacement before using that state would
decide V1 and V2 by default, in favour of the thing that was asked for rather than the thing that
turns out to be missing.

It is worth being clear that this is **not a technical dependency.** Landmasses have outlines
today, regardless of anything in Batch 14, so shape A on land could be built right now; and the
shared machinery — the mode, the falloff, the I5 rung — survives whichever way the water
evaluation goes. `16` §10 said otherwise in an early draft and was corrected. **The dependency is
on the answer, not on the code.**

The right moment for this document to become a batch is the evaluation session in `16` §10, where
V1 gets an answer from use rather than from argument.
