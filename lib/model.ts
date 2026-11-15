// The token radar's model: one sealed snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds the
// pre-token protocols below the floor that pass the same product tests the house's watchlist rule
// states: no token recorded, not an exchange, not a versioned pool of another protocol, and not a
// wrapped, staked or exchange-issued product of a token that already trades. Those early rows are
// the ones a radar exists to find: big enough to matter, early enough to farm before any launch.
//
// Implied value follows only from the snapshot's own figures, one stated formula for every row:
//
//   implied = tvl_usd x category_multiple x growth_multiplier x maturity_multiplier x reach_multiplier
//
//   category_multiple  what a dollar of TVL in this category has historically been worth in token
//                      value: fee-capturing trading and lending at the top, pass-through wrappers
//                      and bridges at the bottom. One table, stated in the dashboard, applied to all.
//   growth_multiplier  1 + clamp(change_7d, -50, 100) / 100 x 0.6: a protocol whose TVL grew 100%
//                      in a week is worth 1.6x its base; one that halved is worth 0.7x.
//   maturity_multiplier  0.55 + 0.45 x min(age_days, 1460) / 1460: the longer a protocol has run
//                      with no token, the more of its record a launch can be priced on. A protocol
//                      whose listing day DefiLlama does not report is scored as 365 days old.
//   reach_multiplier   1 + 0.04 x min(chains - 1, 7): a launch distributed on eight chains starts
//                      with eight audiences, so each chain beyond the first adds 4% up to +28%.
//
// No protocol name is ever special-cased: the same function scores every row, and the dashboard
// shows each row's three multipliers so a reader can check the arithmetic.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  category_multiples: Record<string, number>;
  default_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  reach_per_chain: number;
  reach_max_extra_chains: number;
}

export const MODEL: ModelConstants = {
  category_multiples: {
    Dexs: 0.35,
    Lending: 0.32,
    CDP: 0.3,
    Derivatives: 0.3,
    Chain: 0.28,
    'Yield Aggregator': 0.26,
    Yield: 0.24,
    'Onchain Capital Allocator': 0.24,
    'Risk Curators': 0.22,
    RWA: 0.22,
    'Basis Trading': 0.2,
    'Staking Pool': 0.2,
    'Liquid Staking': 0.18,
    Bridge: 0.16,
    'Canonical Bridge': 0.14,
  },
  default_multiple: 0.22,
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_days: 1460,
  unknown_age_days: 365,
  reach_per_chain: 0.04,
  reach_max_extra_chains: 7,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the dashboard's Live view carries, by market cap. */
export const LIVE_ROWS = 30;

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  on_watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    reach_multiplier: number;
    age_days: number | null;
  };
  farm_capital_usd: number;
  farm_steps: string[];
}

/** The dashboard's view of one row: the board row as the page renders it. */
export interface RadarRow extends BoardRow {}

/** A live-token protocol: it already trades, so the page shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  symbol: string | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  protocols_size: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The category's value multiple under `model`: the table first, the default after. */
export function categoryMultiple(p: SnapshotProtocol, model: ModelConstants): number {
  if (p.category !== null && Object.prototype.hasOwnProperty.call(model.category_multiples, p.category)) {
    return model.category_multiples[p.category]!;
  }
  return model.default_multiple;
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): { implied: number; multiple: number; growthPct: number; growthMult: number; maturityMult: number; reachMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const multiple = categoryMultiple(protocol, model);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const reachMult = 1 + model.reach_per_chain * Math.min(Math.max(protocol.chains.length - 1, 0), model.reach_max_extra_chains);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * growthMult * maturityMult * reachMult));
  return { implied, multiple, growthPct, growthMult, maturityMult, reachMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word that marks a wrapped or staked product of a token that already trades. */
const PRODUCT_WORD = /\b(wrapped|staked|staking)\b/i;

/** An exchange's name at the head of a name: its staked or bridged product, not a launch of its own. */
const EXCHANGE_HEAD = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a pre-token protocol is a launch candidate of its own: not an exchange, not a versioned
 * pool, and not a wrapped, staked or exchange-issued product of a token that already trades. These
 * are the name and category tests of the house's watchlist rule, applied below the floor as well.
 */
export function isLaunchCandidate(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    p.category !== 'CEX' &&
    !VERSIONED.test(p.name) &&
    !PRODUCT_WORD.test(p.name) &&
    !EXCHANGE_HEAD.test(p.name)
  );
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const watchlist = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug on it is ranked, whatever its record looks like.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every launch candidate below the floor, not a capped sample. A board that
  // carries all of them cannot miss the one that launches next.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isLaunchCandidate(p) && p.tvl_usd < snapshot.floor_usd) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => ({ p, ...impliedValue(p, snapshot.as_of, model) }));
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    on_watchlist: watchlist.has(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      category_multiple: s.multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      reach_multiplier: round4(s.reachMult),
      age_days: s.age,
    },
    farm_capital_usd: capitalFor(s.p),
    farm_steps: farmSteps(s.p, s.age),
  }));
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
export function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 100_000_000) return 150;
  if (p.tvl_usd >= 25_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
function step(text: string, cost: string, time: string): string {
  const s = `${text} Cost: ${cost}. Time: ${time}.`;
  return s.length > 600 ? `${s.slice(0, 596)}...` : s;
}

/** The core farming action for a category, in the words a farmer can follow. */
function coreAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend')) return `Supply $${capital} of USDC to ${n} on ${chain}, then borrow $${Math.round(capital / 2)} of USDC against it and supply that back once, so both sides of the market see the wallet.`;
  if (c.includes('cdp')) return `Deposit $${capital} of collateral into a ${n} vault on ${chain} and mint $${Math.round(capital / 2)} of its stablecoin, keeping the collateral ratio above 200%.`;
  if (c.includes('dex')) return `Swap $${capital} of USDC for the pool's other asset on ${n} and add both sides as liquidity to its main ${chain} pool.`;
  if (c.includes('derivative') || c.includes('perpetual')) return `Deposit $${capital} of USDC as margin on ${n} and open one small hedged position, long and short the same size, so the volume is real and the risk is flat.`;
  if (c.includes('bridge') || c.includes('canonical')) return `Bridge $${capital} of USDC from Ethereum to ${chain} through ${n}, then bridge a smaller amount back a week later so both directions count.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${n} on ${chain} and keep the liquid receipt token in the same wallet.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('yield')) return `Deposit $${capital} of USDC into a ${n} vault on ${chain} and leave the shares untouched, so the deposit ages in the vault's records.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${n}'s yield asset on ${chain} with USDC and hold it; make one small redemption later so both flows are recorded.`;
  if (c.includes('basis')) return `Open the basis position ${n} runs with $${capital} of USDC on ${chain}: long the spot asset, short the same size on its perpetual market.`;
  if (c.includes('chain')) return `Move $${capital} of USDC onto ${n} and use three of its native apps in the first week, so the wallet is a real user of the chain.`;
  if (c.includes('prediction')) return `Fund $${capital} and take one position on each side of a liquid market on ${n}, so the wallet trades without betting the farm on one outcome.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${n} on ${chain} for the longest term it offers and keep the policy NFT in the wallet.`;
  return `Deposit $${capital} of USDC into ${n} on ${chain} through its own app and keep the position open.`;
}

/** The second, deepening action for a category: the step that separates a farmer from a passer-by. */
function deepenAction(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend')) return `Vote in one ${n} governance poll or delegate to an active delegate, so the wallet appears in the protocol's governance record as well as its market.`;
  if (c.includes('dex')) return `Make two more swaps a week on ${n} at different hours, so the wallet's volume looks like use and not a single scripted pass.`;
  if (c.includes('bridge') || c.includes('canonical')) return `Use the bridged funds in one ${chain} app the same week, so the bridge record ends in real activity and not a round trip.`;
  if (c.includes('derivative') || c.includes('perpetual')) return `Deposit a second, smaller amount into ${n}'s liquidity vault, so the wallet is both a trader and a backer of the venue.`;
  if (c.includes('staking') || c.includes('restak')) return `Delegate or vote once with the staked position if ${n} offers it, so the wallet is counted as a participant and not only a balance.`;
  if (c.includes('chain')) return `Claim one faucet or ecosystem quest on ${n} each week and keep a small native-token balance for gas, so the wallet never looks rented.`;
  return `Repeat the core action once more in the second month at half size, so the wallet's history spans more than one snapshot of the protocol.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = capital >= 150 ? 8 : 4;
  return [
    step(
      `Start a fresh wallet for this farm and fund it on ${chain}; keep its seed phrase offline and never mix it with a wallet that holds real savings.`,
      'under $3 of gas for the funding transaction',
      '5 minutes',
    ),
    step(
      coreAction(p, capital, chain),
      `$${capital} of capital and about $${gas} of gas`,
      '15 minutes to set up',
    ),
    step(
      deepenAction(p, chain),
      'about $2 of gas each time',
      '10 minutes a week',
    ),
    step(
      `Hold the position for at least ${hold} days, checking it once a week, so the activity is counted in more than one weekly snapshot of ${p.name}.`,
      `the $${capital} stays in the position`,
      `${hold} days`,
    ),
    step(
      `Open ${p.name}'s own points, rewards or governance page once a month and note what it counts; claim only from a link that page publishes, and never pay anyone to claim for you.`,
      'nothing to check, and never a fee to claim',
      '10 minutes a month',
    ),
    step(
      `Keep the whole position under a tenth of your farm budget: ${p.name} records no token today, a launch is a possibility this plan prices, never a promise it relies on.`,
      `at most $${capital} at risk in one protocol`,
      '2 minutes to size',
    ),
    step(
      `Log the wallet, the dates and every transaction hash in a farm log, and unwind in two halves a week apart once the hold ends or a token is announced.`,
      'nothing but the log, and normal gas to exit',
      '5 minutes, then 10 minutes to unwind',
    ),
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      symbol: p.symbol,
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.on_watchlist).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    protocols_size: snapshot.protocols.length,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, shared values, farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'the board names a slug twice';
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const r of board) if (!known.has(r.slug)) return `${r.slug} is not one of the snapshot's protocols`;
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < byRank.length; i++) {
    if (byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) return `rank ${byRank[i]!.rank} outranks rank ${byRank[i - 1]!.rank} on implied value`;
  }
  if (board.length >= 2 && byRank[0]!.implied_value_usd === byRank[byRank.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
