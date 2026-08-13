# Debt Ledger

_What this project owes **and has nowhere else to live.** Rows are deleted when paid — git
history is the archive, so this file only ever shows what is still outstanding._

Sits outside `v1/` deliberately: those documents describe the design of a version, this one
tracks the state of the codebase.

---

## Where debt goes — this file is the last resort

Three destinations. The right one is whichever is **hardest to lose**:

| | Destination | Why it survives | What goes there |
|---|---|---|---|
| 1 | A **`ponytail:` comment** at the line it applies to | It travels with the code when that code is refactored, it is unmissable while editing the thing it describes, and `grep -rn "ponytail:" src/` is the index | Shortcuts, ceilings and measurements that belong to a specific place |
| 2 | **The work package that will pay it** — its entry in `v1/05-p0-build-checklist.md` and in its prompt | It gets *done* rather than merely known, because it becomes an acceptance criterion | Anything with an owner |
| 3 | **A row in this file** | Nothing else holds it | Debt with neither a line nor an owner — cross-cutting measurements, and absences |

Two rules follow from that ordering:

- **If it can be a comment, it is a comment.** A row that restates one is a copy, and the copy
  drifts while the original moves with its code. This file is not an inventory of the code.
- **If you cannot write "Retire when", it is not debt** — it is a decision, and it wants an ADR
  in `v1/03-architecture-decisions.md`.

---

## Open

| ID | What | Measured under | Retire when |
|---|---|---|---|
| **Q-01** | A **whole-scene replacement** re-caches all five inactive layers — generate, a restored draft, undo of a whole-scene step. That is ~1 200 sprites redrawn per layer, and a contributor to the hitch you feel on generate. **Re-checked at WP-36 and still real, but cheaper and narrower than the numbers below suggest**: ADR-44 stopped the *hit* canvas being built at all (it was 51% of the cost of a re-cache) and made an empty layer live, so a fresh map re-caches two layers rather than six. The row survives because a whole-scene replacement still rebuilds every layer that holds anything, in one frame — which is the part no measurement has yet been taken of *since* those changes. Genuinely cross-cutting: the cache strategy (`canvas/useLayerCache.ts`), the layer list (`canvas/MapStage.tsx`) and the generate apply path (`state/editorStore.ts`) each own a piece, so no single line owns it. **Narrowed in the WP-19 pass**: it used to read "every scene change", which is not true and has not been for some time — `useLayerCache` keys on `layer.objects` and `setLayerObjects` leaves the other layers' arrays identical, so an ordinary edit re-caches only the layer it touched | 4000×3000 landscape, generated world of ~1 180 objects across six layers | Someone measures it as the dominant post-generate cost and re-caches only the layers whose contents actually changed. **No package owns it** — WP-18 was named here as the natural moment and shipped without paying it, which is why this row is now worded as a measurement rather than a plan |

| **V-01** | An intermittent `TypeError: Cannot read properties of null (reading 'getSnapshot')` — React's `useSyncExternalStore`, so a store read reaching a torn-down fiber. Seen twice while driving WP-15's terrain work, **and reproduced on the pre-change code**, so it predates it. Every assertion *after* it still passed, both times, so it is thrown outside render and does not take the tree down. No stack was ever captured. **Ruled out by ~48 targeted attempts: 26 drag-and-theme-toggle cycles in one session, 14 boots with early interaction, 8 HMR updates — all clean.** So it is not the drag path, not a boot race, and not plainly Fast Refresh; the trigger is still unknown, which is exactly why this row exists rather than a guess. **WP-19's driver ran clean too** — a full run of paint, place, select, marquee, recolour and a terrain drag, with `Runtime.exceptionThrown` subscribed throughout | headless Chrome at dpr 1, dev server. Both sightings were inside full driver runs that navigated a page and then painted, selected and dragged terrain; ~2 of 6 such runs | A sighting arrives **with a stack** — every driver now keeps the full `Runtime.exceptionThrown` description rather than its first line — and the subscription that outlives its component is fixed. Or the three eliminated hypotheses plus a long clean stretch justify deleting the row as no longer real |

| **V-02** | **Rivers have no network model, and two visible defects follow from it.** A river is an independent filled ribbon that knows nothing about any other river (ADR-14), so nothing can break the coast stroke at a mouth and nothing makes width accumulate downstream. Seen: a coast stroke crossing the river mouth (fully diagnosed — `drawLandmass` strokes the path at `lineWidth 3`, a stroke straddles its path, and WP-34 clips the river to that same path, so the outer 1.5 units survive across the opening), and a tributary drawn wider than the trunk it joins, which water cannot do. Both were patched locally by WP-29 and WP-34 and both patches were reasonable; together they are the shape of a missing abstraction. **Full analysis, four falsifiable hypotheses, four mitigations that need no engine, and the five decisions N1–N5 a network model must settle: `v1/15-river-engine.md`.** **It now has an owner — Batch 14** (`v1/16-water-as-objects.md`, WP-40 … WP-43), so by this file's own ordering it has moved to destination 2 and is an acceptance criterion there. **All four packages are now built**, and both defects are gone from the code — a fixture asserts one merged boundary at an estuary and a driver finds no coast stroke across the mouth. The row survives on the *other* half of its reason: Batch 14 is **experimental**, and if the evaluation (`16` §10) rejects the water model this row is what is left | Judged by eye on a painted coast at fit zoom and at 88%; two screenshots, no measurement | **`16` §10 records "accept".** Shipping the packages was necessary and is done; it is not sufficient, because the design is explicitly not approved in shape. Water is now a substance subtracted from land, so there is no mouth for a stroke to cross and a union has no trunk and no tributary — both defects stopped being *representable* rather than being mitigated. **Delete this row when the evaluation accepts the model**; if it rejects it, the retire-when below comes back with the design that returns. **Do not take `15` §4's M1 or M3 in the meantime**: they patch what WP-40 removes structurally, so they are work thrown away. They return only if the evaluation rejects the design, at which point the old retire-when — someone wants a delta, a braided channel or generated rivers, with N1–N5 settled first — comes back with it |

Series: **Q-** measurements · **V-** absences with no owner · **D-** doc/contract drift. Take
the next free number in the series; never renumber an existing row.

## Not tracked here — and where it is instead

| | Where it lives |
|---|---|
| Deliberate shortcuts and ceilings in code | `grep -rn "ponytail:" src/` — 21 of them, each naming its own ceiling and upgrade trigger |
| Open design decisions | **None with an owner** — every decision belonging to a scheduled package is settled: `v1/08` D1–D6, `v1/09` E1–E15, `v1/10` F1–F5, `v1/12` D1–D4, `v1/13` D5–D10, `v1/14` D1–D12, and **`v1/16` D1–D18** (two of which, D8 and D13, dissolved rather than resolved). **`v1/15` N1–N5 are no longer five open questions**: Batch 14 answers **N3** and **N4** (ADR-47; `16` D6), makes **N1** and **N2** moot — there is no graph to shape and no derived width to govern, since `16` D7 closes H2 permanently — and leaves **N5 alone** (does the generator emit water; `16` D11 defers it). **`v1/17` V1–V11 are open with no owner** and stay that way by design: V1 cannot be answered before Batch 14 has been *used* — which is now possible, and is exactly what `16` §10's session is for — so they sit in a note rather than a package |
| Features deferred from v1 | `v1/01-system-design.md` §15. Absence of a feature is not debt |
| Unbuilt work packages | **None in 0.5.** Batch 14's WP-40 … WP-43 are built (`v1/16-water-as-objects.md`); everything before them had already shipped — WP-14 … WP-38, plus **WP-39** (CI/CD and the staging deploy). What remains for the batch is **not a package**: the evaluation session `16` §10 makes binding, which the owner runs by hand and which may accept with tweaks or revamp completely. Until it is recorded, nothing may be built on top and node editing (`16` D3) stays unscheduled. `v1/05-p0-build-checklist.md` tracks it and P1–P3 |
| Deploying the built SPA | WP-13's entry, and now a **multi-file** deploy: `dist/` holds four HTML entries and the host must route `/maps*` to `app.html` (ADR-40, `README.md`, and the nginx site in `platform/01-zitadel-setup.md` §4). **The host is now chosen** — the VPS, behind **nginx** (ADR-46, amending ADR-34 and `platform/README.md` D4), frontend-only. **And it is half built**: since **WP-39**, every merge to `main` ships to an authenticated **staging** host, with the routing rule, the font cache lifetime and the worker CSP checked against a real server on each release and a rollback on a failed smoke test. **Production — a public domain — is what remains.** Unbuilt work, not debt, but `v1/16` §8 depends on it: WP-40's migration *deletes* every existing river, which is free only while the owner is the only person holding drafts |
| Platform decisions and open verifications | `platform/README.md` D1–D5, and `platform/01-zitadel-setup.md` §3 for what must be verified against a live Zitadel at P2 WP-1 |

---

## For the AI agent — maintenance protocol

**Trigger.** Whenever the user mentions tech debt, code debt, shortcuts, "TODO", "for now",
"we'll fix it later", "what's outstanding", "what's not done", or asks for a cleanup pass:
**read this file first, then update it in the same turn.** Answer from the file and the code,
not from memory, and do not invent a different format.

**Recording new debt.** Pick the destination from the table above, in that order. Most debt is
destination 1 or 2 — reaching for a row here should feel like the exception. Then:

1. Write the ceiling **and** what would retire it. A note that only says "this is a shortcut"
   is not usable by whoever finds it.
2. For a measurement, record **the conditions it was taken under** — canvas size, object count,
   seeds. A number without its conditions cannot be re-run, so it can never be falsified, so it
   becomes permanent.
3. If a scheduled package will pay it, add it to that package's entry too, so it is inherited
   rather than merely filed.

**Paying it off.** Delete the row, or the comment, in the same commit as the fix. Never move
rows to a "done" section: git history is the archive, and a growing list of closed items is how
a ledger stops being read.

**Re-checking — the part with no automation.** `grep` polices destination 1 for free; these
rows have no code anchor, so nothing will ever tell you one was quietly fixed. On any pass
through this file, re-read every row and ask: is it still true, has it been fixed, do its
measurement conditions still hold? That is feasible precisely because the file is short — keep
it short. **A ledger confidently listing debt that was paid months ago is worse than no
ledger**, because it is trusted.

**Never** put design rationale here, and never restate an ADR. A row says what is owed and what
settles it. If it needs a paragraph, the design belongs in a `v1/` document and the row should
point at it.
