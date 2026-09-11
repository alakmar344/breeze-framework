# Breeze implementation for Krausest `js-framework-benchmark` (keyed)

This directory is a **submission-ready draft** for the upstream
[`js-framework-benchmark`](https://github.com/krausest/js-framework-benchmark) repo.
It exists so our numbers can be independently reproduced outside our own runner —
"Breeze is implemented in an external standardized suite", not just "Breeze's
benchmark says Breeze is fast".

## Single source of truth

The implementation is [`../../breeze/index.html`](../breeze/index.html) — this directory
does **not** fork it, so the submitted code and the locally benchmarked code cannot drift.

## Upstream selector contract (verified against our local CDP runner)

| Upstream operation | Trigger | Breeze behavior |
| :--- | :--- | :--- |
| `run` (create 1,000) | click `#run` | `Breeze.setState('rows', buildData(1000))` |
| `runLots` (create 10,000) | click `#runlots` | `Breeze.setState('rows', buildData(10000))` |
| `add` (append 1,000) | click `#add` | concat + setState (prefix fast-path / HTML tail) |
| `update` (every 10th) | click `#update` | new objects for touched rows, keyed patch |
| `clear` | click `#clear` | `setState('rows', [])` |
| `swapRows` | click `#swaprows` | swap indexes 4/997, LIS reorder (~2 moves) |
| `select` | click `.lbl` | direct class toggle (no list reconciliation) |
| `remove` | click `.remove` | filter by `_bzItemKey` + keyed removal |

Rows render as `<tr>` with `data-bz-key`, label in `.lbl`, remove handle in `.remove`.

## What a submitter must do upstream

1. Copy this `breeze/` directory to upstream `frameworks/keyed/breeze/`.
2. Check upstream's current `package.json` conventions (they evolve — e.g. benchmark
   version pins, webdriver config) and adjust the draft `package.json` here.
3. Breeze needs **no build step**: serve the directory statically and point the
   webdriver driver at `index.html`. Dependencies: none.
4. Expect upstream numbers to differ from `benchmark.md`: different driver
   (webdriver vs our CDP runner), different hardware, different Chrome. Ordering —
   not milliseconds — is the portable claim.

## Why this matters

Our local runner controls for everything except the framework, which is exactly what
you want for iteration — but it is still our harness. An upstream implementation lets
anyone reproduce the result with someone else's driver. Until it is merged upstream,
treat this directory as the next-best thing: a frozen, submittable artifact.
