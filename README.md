# Token Radar

A token launch radar for make.fun's token-radar-01 bounty. The program reads the sealed DefiLlama
snapshot at `/input/snapshot.json`, ranks every pre-token launch candidate by an implied value
computed from the snapshot's own figures, and writes a dashboard a reader can farm from.

## Run it

```
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Node 22.18+, standard library only, no network. The program is deterministic: two runs over the
same snapshot write the same bytes. It writes, under the output directory:

- `board.json` — the ranked board (the scored artifact),
- `data.js` — the dashboard's data, written from the same board so page and board cannot disagree,
- `dashboard/` — the static page (board, detail view per protocol, live-token view, the model),
- `screenshots/` — the board, a detail view, and a filtered view, rendered from the page itself,
- `dossier.json` — the judge's summary, built with the vendored make.fun library.

## The model

One formula scores every row; no protocol is named anywhere in the code.

```
implied value = TVL × category rate × growth × maturity × reach
```

- **Category rate** — what a dollar of TVL in the category has historically been worth in token
  value: Dexs ×0.35, Lending ×0.32, CDP and Derivatives ×0.30, down to Canonical Bridge ×0.14;
  every other category ×0.22.
- **Growth** — the seven-day TVL change, clamped to −50%…+100%, weighted ×0.6.
- **Maturity** — 0.55 + 0.45 × age / 1460 days of token-free history; an unrecorded listing day
  scores as 365 days.
- **Reach** — +4% per chain beyond the first, up to seven extra chains: a launch distributed on
  eight chains starts with eight audiences.

## Who gets on the board

- **The watchlist is the floor.** All 40 of the snapshot's watchlist protocols are ranked.
- **Early finds.** Below the $50M floor, every protocol that records no token and passes the
  watchlist rule's own product tests — no versioned pool names, no wrapped or staked products, no
  exchange-issued products — is ranked too: 173 of them, 213 rows in all. The radar carries all of
  them rather than a sample, so it cannot miss the one that launches next.
- **Live tokens are separated.** A protocol whose token already trades never takes a ranked row;
  the dashboard's Live view shows the top 30 at the market's own values.

Every row carries a seven-step farm plan derived from its own record (category, chains, TVL, age):
the wallet setup, the funding, the category's core action, a deepening action, the hold, the
points-page check, the risk sizing and the exit — each with what it costs and how long it takes.

## Layout

- `main.ts` — the entrypoint: snapshot in, board + dashboard + dossier out.
- `lib/model.ts` — the model: selection, implied value, farm plans, board self-check.
- `dashboard/` — the page: `index.html`, `app.css`, `app.js`; views live in the hash
  (`#/`, `#/live`, `#/model`, `#/p/<slug>`, `#/?cat=..&chain=..&q=..&watch=1&sort=..`).
- `vendor/makefun-board.ts` — make.fun's dossier library, byte for byte the kit's copy.
- `screenshots/` — rendered from the built page with headless Chromium at 1280×960.

Implied value is this dashboard's own model claim. "Records no token" is what DefiLlama's record
says — a record, not a proof — and no launch is promised.

## License

MIT, see `LICENSE`.
