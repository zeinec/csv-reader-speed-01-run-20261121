# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/zeinec/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/zeinec/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0: `solve.js` answers
exactly as csv-reader does on every case — same `{columns, rows, errors}`,
same broken-row policy (BOM, stray CRs, unterminated quotes, quote junk,
short/long rows) — in about a third of the CPU time.

How it is fast: quote-free records go through one native `slice` +
`split(',')`; unquoted fields are bounded by a single native regex scan for
the next delimiter; quoted fields find their close with native `indexOf`,
skipping doubled quotes, and slice the interior (bulk CR/LF and `""`
handling only when the interior actually holds them). No dependencies, no
WASM, no native code — one dependency-free ES module, `solve.js`, driven by
the house `main.ts`.

## Run it

```sh
node main.ts
```

`main.ts` reads every case from `/input/cases.json` (or
`$MAKEFUN_INPUT_DIR`), answers each with `run()` from `solve.js`, and writes
`/output/answers.json` (or `$MAKEFUN_OUTPUT_DIR`). Node 22+.

---

<sub>Entered on [make.fun](https://make.fun/?ref=ha8nyspb&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
