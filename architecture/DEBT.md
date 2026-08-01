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
| **Q-01** | Every scene change re-caches all five inactive layers. After a generate that is ~1 200 sprites redrawn per layer, for a scene that just replaced everything — a contributor to the hitch you feel on generate. Genuinely cross-cutting: the cache strategy (`canvas/useLayerCache.ts`), the layer list (`canvas/MapStage.tsx`) and the generate apply path (`state/editorStore.ts`) each own a piece, so no single line owns it | 4000×3000 landscape, generated world of ~1 180 objects across six layers | Someone measures it as the dominant post-generate cost and re-caches only the layers whose contents actually changed. **WP-18 is the natural moment** — it is already rewriting which layers are live, and carries a frame-time measurement of its own |

| **V-01** | An intermittent `TypeError: Cannot read properties of null (reading 'getSnapshot')` — React's `useSyncExternalStore`, so a store read reaching a torn-down fiber. Seen twice while driving WP-15's terrain work, **and reproduced on the pre-change code**, so it predates it. Every assertion *after* it still passed, both times, so it is thrown outside render and does not take the tree down. No stack was ever captured. **Ruled out by ~48 targeted attempts: 26 drag-and-theme-toggle cycles in one session, 14 boots with early interaction, 8 HMR updates — all clean.** So it is not the drag path, not a boot race, and not plainly Fast Refresh; the trigger is still unknown, which is exactly why this row exists rather than a guess | headless Chrome at dpr 1, dev server. Both sightings were inside full driver runs that navigated a page and then painted, selected and dragged terrain; ~2 of 6 such runs | A sighting arrives **with a stack** — every driver now keeps the full `Runtime.exceptionThrown` description rather than its first line — and the subscription that outlives its component is fixed. Or the three eliminated hypotheses plus a long clean stretch justify deleting the row as no longer real |

Series: **Q-** measurements · **V-** absences with no owner · **D-** doc/contract drift. Take
the next free number in the series; never renumber an existing row.

## Not tracked here — and where it is instead

| | Where it lives |
|---|---|
| Deliberate shortcuts and ceilings in code | `grep -rn "ponytail:" src/` — each names its own ceiling and upgrade trigger |
| Open design decisions (D4, D6) | `v1/08-terrain-as-objects.md` §8 — decisions gate work rather than sit inside it. D1 was settled by ADR-28 |
| Features deferred from v1 | `v1/01-system-design.md` §15. Absence of a feature is not debt |
| Unbuilt work packages (WP-19, WP-20, WP-21) | `v1/05-p0-build-checklist.md` |
| Deploying the built SPA | WP-13's entry — the bundle is static and the README documents the host requirements; picking a host is the owner's call, not debt |

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
