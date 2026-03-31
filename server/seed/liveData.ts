import type { DataCatalog, MetricRecord, TrendPoint, ComparisonPoint, BulletPoint, FeedItem, TableRow } from '../../src/types.js';

// ─── Cache layer ────────────────────────────────────────────────────────────
interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL = 60_000; // 60 seconds

async function cachedFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (entry && Date.now() - entry.fetchedAt < CACHE_TTL) {
    return entry.data;
  }
  const data = await fetcher();
  cache.set(key, { data, fetchedAt: Date.now() });
  return data;
}

// ─── HTTP helper ────────────────────────────────────────────────────────────
async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'AdaptiveDashboard/1.0' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.json() as Promise<T>;
}

// ─── CoinGecko types ────────────────────────────────────────────────────────
interface CoinMarket {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  total_volume: number;
  price_change_percentage_24h: number;
  price_change_percentage_7d_in_currency?: number;
  sparkline_in_7d?: { price: number[] };
  ath: number;
  atl: number;
  high_24h: number;
  low_24h: number;
  circulating_supply: number;
  max_supply: number | null;
}

interface CoinChart {
  prices: [number, number][];
  market_caps: [number, number][];
  total_volumes: [number, number][];
}

// ─── GitHub types ───────────────────────────────────────────────────────────
interface GitHubRepo {
  name: string;
  full_name: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  watchers_count: number;
  language: string;
  updated_at: string;
  pushed_at: string;
  description: string;
}

interface GitHubEvent {
  id: string;
  type: string;
  actor: { login: string };
  repo: { name: string };
  created_at: string;
  payload: Record<string, unknown>;
}

// ─── HackerNews types ───────────────────────────────────────────────────────
interface HNItem {
  id: number;
  title: string;
  by: string;
  score: number;
  time: number;
  type: string;
  url?: string;
  descendants?: number;
}

// ─── Data fetchers ──────────────────────────────────────────────────────────

async function fetchCryptoMarkets(): Promise<CoinMarket[]> {
  return cachedFetch('crypto_markets', () =>
    fetchJson<CoinMarket[]>(
      'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=true&price_change_percentage=7d'
    )
  );
}

async function fetchCoinChart(coinId: string, days: number = 30): Promise<CoinChart> {
  return cachedFetch(`coin_chart_${coinId}_${days}`, () =>
    fetchJson<CoinChart>(
      `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`
    )
  );
}

async function fetchGitHubRepos(org: string): Promise<GitHubRepo[]> {
  return cachedFetch(`github_repos_${org}`, () =>
    fetchJson<GitHubRepo[]>(
      `https://api.github.com/orgs/${org}/repos?sort=stars&per_page=10&direction=desc`
    )
  );
}

async function fetchGitHubEvents(org: string): Promise<GitHubEvent[]> {
  return cachedFetch(`github_events_${org}`, () =>
    fetchJson<GitHubEvent[]>(
      `https://api.github.com/orgs/${org}/events?per_page=15`
    )
  );
}

async function fetchHNTopStories(): Promise<HNItem[]> {
  return cachedFetch('hn_top', async () => {
    const ids = await fetchJson<number[]>(
      'https://hacker-news.firebaseio.com/v0/topstories.json'
    );
    const topIds = ids.slice(0, 8);
    const items = await Promise.all(
      topIds.map(id =>
        fetchJson<HNItem>(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
      )
    );
    return items.filter(Boolean);
  });
}

// ─── Transform helpers ──────────────────────────────────────────────────────

function sampleSparkline(prices: number[], count: number = 10): number[] {
  if (prices.length <= count) return prices.map(p => Math.round(p * 100) / 100);
  const step = Math.floor(prices.length / count);
  return Array.from({ length: count }, (_, i) =>
    Math.round(prices[Math.min(i * step, prices.length - 1)] * 100) / 100
  );
}

function trendDirection(delta: number): 'up' | 'down' | 'steady' {
  if (delta > 0.5) return 'up';
  if (delta < -0.5) return 'down';
  return 'steady';
}

function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function eventTypeToTitle(type: string): string {
  const map: Record<string, string> = {
    PushEvent: 'Code pushed',
    PullRequestEvent: 'Pull request activity',
    IssuesEvent: 'Issue updated',
    CreateEvent: 'Branch or tag created',
    DeleteEvent: 'Branch or tag deleted',
    WatchEvent: 'Repository starred',
    ForkEvent: 'Repository forked',
    ReleaseEvent: 'New release published',
    IssueCommentEvent: 'Issue comment added',
    PullRequestReviewEvent: 'PR review submitted',
    PullRequestReviewCommentEvent: 'PR review comment',
  };
  return map[type] ?? type.replace(/Event$/, ' event');
}

function eventSeverity(type: string): 'info' | 'attention' | 'critical' {
  if (['ReleaseEvent', 'DeleteEvent'].includes(type)) return 'critical';
  if (['PullRequestEvent', 'IssuesEvent'].includes(type)) return 'attention';
  return 'info';
}

// ─── Build DataCatalog ──────────────────────────────────────────────────────

export async function fetchLiveData(): Promise<DataCatalog> {
  // Fetch all data sources in parallel
  const [coins, btcChart, ethChart, repos, events, hnStories] = await Promise.all([
    fetchCryptoMarkets(),
    fetchCoinChart('bitcoin', 90),
    fetchCoinChart('ethereum', 90),
    fetchGitHubRepos('facebook').catch(() => [] as GitHubRepo[]),
    fetchGitHubEvents('facebook').catch(() => [] as GitHubEvent[]),
    fetchHNTopStories().catch(() => [] as HNItem[]),
  ]);

  const btc = coins.find(c => c.id === 'bitcoin');
  const eth = coins.find(c => c.id === 'ethereum');
  const sol = coins.find(c => c.id === 'solana');
  const bnb = coins.find(c => c.id === 'binancecoin');
  const xrp = coins.find(c => c.id === 'ripple');
  const ada = coins.find(c => c.id === 'cardano');
  const doge = coins.find(c => c.id === 'dogecoin');
  const dot = coins.find(c => c.id === 'polkadot');

  const totalMarketCap = coins.reduce((sum, c) => sum + (c.market_cap || 0), 0);
  const totalVolume = coins.reduce((sum, c) => sum + (c.total_volume || 0), 0);
  const avgChange = coins.slice(0, 10).reduce((sum, c) => sum + (c.price_change_percentage_24h || 0), 0) / 10;
  const positiveCoins = coins.filter(c => (c.price_change_percentage_24h || 0) > 0).length;

  const topRepo = repos[0];
  const totalStars = repos.reduce((sum, r) => sum + r.stargazers_count, 0);
  const totalForks = repos.reduce((sum, r) => sum + r.forks_count, 0);
  const totalIssues = repos.reduce((sum, r) => sum + r.open_issues_count, 0);

  // ─── Metrics ──────────────────────────────────────────────────────────

  const metrics: Record<string, MetricRecord> = {
    // Admin metrics — GitHub health
    adminCoverage: {
      id: 'adminCoverage',
      label: 'Total stars',
      value: totalStars,
      delta: topRepo ? Math.round(topRepo.stargazers_count / 1000) : 0,
      trend: 'up',
      unit: 'number',
      context: `Across ${repos.length} public repositories.`,
      sparkline: repos.slice(0, 10).map(r => r.stargazers_count),
    },
    adminReliability: {
      id: 'adminReliability',
      label: 'Fork ratio',
      value: totalStars > 0 ? Math.round((totalForks / totalStars) * 100 * 100) / 100 : 0,
      delta: 2.1,
      trend: 'up',
      unit: 'percent',
      context: 'Forks as percentage of total stars.',
      sparkline: repos.slice(0, 10).map(r => r.stargazers_count > 0 ? Math.round((r.forks_count / r.stargazers_count) * 100) : 0),
    },
    adminDrift: {
      id: 'adminDrift',
      label: 'Open issues',
      value: totalIssues,
      delta: topRepo ? -Math.round(topRepo.open_issues_count / 10) : 0,
      trend: totalIssues > 500 ? 'up' : 'down',
      unit: 'number',
      context: 'Issues requiring attention across all repos.',
      sparkline: repos.slice(0, 10).map(r => r.open_issues_count),
    },
    adminLatency: {
      id: 'adminLatency',
      label: 'Active repos',
      value: repos.length,
      delta: 0,
      trend: 'steady',
      unit: 'number',
      context: 'Top public repositories by star count.',
      sparkline: repos.slice(0, 10).map(r => r.watchers_count),
    },

    // Analyst metrics — Crypto signals
    analystConfidence: {
      id: 'analystConfidence',
      label: 'BTC price',
      value: btc?.current_price ?? 0,
      delta: Math.round((btc?.price_change_percentage_24h ?? 0) * 100) / 100,
      trend: trendDirection(btc?.price_change_percentage_24h ?? 0),
      unit: 'currency',
      context: `24h high: $${btc?.high_24h?.toLocaleString() ?? '—'} · low: $${btc?.low_24h?.toLocaleString() ?? '—'}`,
      sparkline: sampleSparkline(btc?.sparkline_in_7d?.price ?? []),
    },
    analystDrift: {
      id: 'analystDrift',
      label: 'ETH price',
      value: eth?.current_price ?? 0,
      delta: Math.round((eth?.price_change_percentage_24h ?? 0) * 100) / 100,
      trend: trendDirection(eth?.price_change_percentage_24h ?? 0),
      unit: 'currency',
      context: `24h high: $${eth?.high_24h?.toLocaleString() ?? '—'} · low: $${eth?.low_24h?.toLocaleString() ?? '—'}`,
      sparkline: sampleSparkline(eth?.sparkline_in_7d?.price ?? []),
    },
    analystCycle: {
      id: 'analystCycle',
      label: 'Market sentiment',
      value: Math.round(avgChange * 100) / 100,
      delta: Math.round(avgChange * 100) / 100,
      trend: trendDirection(avgChange),
      unit: 'percent',
      context: `${positiveCoins} of top ${Math.min(coins.length, 20)} coins are green.`,
      sparkline: coins.slice(0, 10).map(c => Math.round((c.price_change_percentage_24h || 0) * 100) / 100),
    },
    analystYield: {
      id: 'analystYield',
      label: '24h volume',
      value: Math.round(totalVolume / 1_000_000_000),
      delta: Math.round(avgChange * 10) / 10,
      trend: trendDirection(avgChange),
      unit: 'number',
      context: `Total 24h trading volume across top ${coins.length} coins (in billions USD).`,
      sparkline: coins.slice(0, 10).map(c => Math.round(c.total_volume / 1_000_000_000)),
    },

    // Business metrics — Portfolio/market overview
    businessCoverage: {
      id: 'businessCoverage',
      label: 'Market breadth',
      value: Math.round((positiveCoins / Math.max(coins.length, 1)) * 100),
      delta: Math.round(avgChange * 10) / 10,
      trend: trendDirection(avgChange),
      unit: 'percent',
      context: 'Percentage of tracked coins in positive territory.',
      sparkline: coins.slice(0, 10).map(c => c.price_change_percentage_24h > 0 ? 1 : 0).reduce((acc: number[], v, i) => { acc.push((acc[i - 1] ?? 0) + v); return acc; }, [] as number[]).map(v => Math.round((v / Math.max(1, coins.slice(0, 10).length)) * 100)),
    },
    businessVelocity: {
      id: 'businessVelocity',
      label: 'Total market cap',
      value: Math.round(totalMarketCap / 1_000_000_000),
      delta: Math.round(avgChange * 10) / 10,
      trend: trendDirection(avgChange),
      unit: 'number',
      context: 'Total market capitalization in billions USD.',
      sparkline: coins.slice(0, 10).map(c => Math.round(c.market_cap / 1_000_000_000)),
    },
    businessRisk: {
      id: 'businessRisk',
      label: 'At-risk assets',
      value: coins.filter(c => (c.price_change_percentage_24h ?? 0) < -5).length,
      delta: -coins.filter(c => (c.price_change_percentage_24h ?? 0) < -5).length,
      trend: coins.filter(c => (c.price_change_percentage_24h ?? 0) < -5).length > 3 ? 'up' : 'down',
      unit: 'number',
      context: 'Coins with >5% loss in the last 24 hours.',
      sparkline: coins.slice(0, 10).map(c => Math.abs(Math.min(0, c.price_change_percentage_24h ?? 0))),
    },
    businessCycle: {
      id: 'businessCycle',
      label: 'BTC dominance',
      value: btc ? Math.round((btc.market_cap / totalMarketCap) * 100 * 10) / 10 : 0,
      delta: Math.round((btc?.price_change_percentage_24h ?? 0) * 10) / 10,
      trend: trendDirection(btc?.price_change_percentage_24h ?? 0),
      unit: 'percent',
      context: 'Bitcoin share of total cryptocurrency market cap.',
      sparkline: sampleSparkline(btc?.sparkline_in_7d?.price ?? []).map(p => Math.round((p / (btc?.current_price ?? 1)) * (btc ? (btc.market_cap / totalMarketCap) * 100 : 50))),
    },
  };

  // ─── Trends ───────────────────────────────────────────────────────────

  function chartToTrend(chart: CoinChart, benchmarkChart?: CoinChart): TrendPoint[] {
    const prices = chart.prices;
    const step = Math.max(1, Math.floor(prices.length / 12));
    return Array.from({ length: 12 }, (_, i) => {
      const idx = Math.min(i * step, prices.length - 1);
      const date = new Date(prices[idx][0]);
      const primary = Math.round(prices[idx][1]);
      const benchIdx = benchmarkChart ? Math.min(idx, benchmarkChart.prices.length - 1) : idx;
      const benchmark = benchmarkChart
        ? Math.round(benchmarkChart.prices[benchIdx][1])
        : Math.round(primary * 0.92);
      return {
        label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        primary,
        benchmark,
      };
    });
  }

  const trends: Record<string, TrendPoint[]> = {
    adminHealth: repos.slice(0, 12).map((r, i) => ({
      label: r.name.slice(0, 8),
      primary: r.stargazers_count,
      benchmark: r.forks_count * 3,
    })),
    analystSignals: chartToTrend(btcChart).map((point, i) => ({
      ...point,
      secondary: ethChart.prices.length > 0
        ? Math.round(ethChart.prices[Math.min(i * Math.floor(ethChart.prices.length / 12), ethChart.prices.length - 1)][1])
        : undefined,
    })),
    businessForecast: chartToTrend(btcChart, ethChart),
  };

  // ─── Comparisons ──────────────────────────────────────────────────────

  function coinToComparison(coin: CoinMarket | undefined, targetPct: number): ComparisonPoint {
    if (!coin) return { label: 'N/A', value: 0, target: 0, note: 'Data unavailable' };
    const perf = Math.round(50 + (coin.price_change_percentage_24h ?? 0) * 5);
    return {
      label: coin.name,
      value: Math.max(0, Math.min(100, perf)),
      target: targetPct,
      note: `${coin.price_change_percentage_24h?.toFixed(2) ?? '0'}% 24h · $${coin.current_price.toLocaleString()}`,
    };
  }

  const comparisons: Record<string, ComparisonPoint[]> = {
    capacityMix: [
      coinToComparison(btc, 75),
      coinToComparison(eth, 70),
      coinToComparison(sol, 65),
      coinToComparison(bnb, 60),
    ],
    channelLift: [
      coinToComparison(xrp, 60),
      coinToComparison(ada, 55),
      coinToComparison(doge, 50),
      coinToComparison(dot, 55),
    ],
    portfolioValue: coins.slice(0, 4).map(c => coinToComparison(c, 65)),
  };

  // ─── Bullet sets ──────────────────────────────────────────────────────

  function coinToBullet(coin: CoinMarket | undefined, target: number): BulletPoint {
    if (!coin) return { label: 'N/A', value: 0, target, floor: 0, stretch: 100, unit: '%', note: 'Data unavailable' };
    const score = Math.max(0, Math.min(100, Math.round(50 + (coin.price_change_percentage_24h ?? 0) * 5)));
    return {
      label: coin.name,
      value: score,
      target,
      floor: Math.max(0, target - 30),
      stretch: 100,
      unit: '%',
      note: `Price: $${coin.current_price.toLocaleString()} · Vol: $${Math.round(coin.total_volume / 1_000_000)}M`,
    };
  }

  const bulletSets: Record<string, BulletPoint[]> = {
    policyTargets: [
      coinToBullet(btc, 80),
      coinToBullet(eth, 75),
      coinToBullet(sol, 70),
    ],
    anomalyTargets: [
      coinToBullet(xrp, 65),
      coinToBullet(ada, 60),
      coinToBullet(doge, 55),
    ],
    growthTargets: [
      coinToBullet(bnb, 70),
      coinToBullet(dot, 65),
      coinToBullet(coins[7], 60),
    ],
  };

  // ─── Feeds ────────────────────────────────────────────────────────────

  const adminFeed: FeedItem[] = events.slice(0, 4).map((ev, i) => ({
    id: `gh-${ev.id}`,
    title: eventTypeToTitle(ev.type),
    detail: `${ev.actor.login} in ${ev.repo.name}`,
    category: ev.type.replace(/Event$/, ''),
    severity: eventSeverity(ev.type),
    time: formatTime(ev.created_at),
  }));

  const analystFeed: FeedItem[] = coins.slice(0, 4).map((coin, i) => {
    const pct = coin.price_change_percentage_24h ?? 0;
    const severity: FeedItem['severity'] = Math.abs(pct) > 5 ? 'critical' : Math.abs(pct) > 2 ? 'attention' : 'info';
    return {
      id: `crypto-${coin.id}`,
      title: `${coin.name} ${pct >= 0 ? 'up' : 'down'} ${Math.abs(pct).toFixed(2)}%`,
      detail: `Price: $${coin.current_price.toLocaleString()} · Vol: $${Math.round(coin.total_volume / 1_000_000_000)}B · MCap: $${Math.round(coin.market_cap / 1_000_000_000)}B`,
      category: pct > 2 ? 'Rally' : pct < -2 ? 'Selloff' : 'Stable',
      severity,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
    };
  });

  const businessFeed: FeedItem[] = hnStories.slice(0, 4).map((story, i) => ({
    id: `hn-${story.id}`,
    title: story.title,
    detail: `by ${story.by} · ${story.score} points · ${story.descendants ?? 0} comments`,
    category: 'Tech News',
    severity: (story.score > 500 ? 'critical' : story.score > 200 ? 'attention' : 'info') as FeedItem['severity'],
    time: formatTime(new Date(story.time * 1000)),
  }));

  const feeds: Record<string, FeedItem[]> = {
    adminFeed: adminFeed.length > 0 ? adminFeed : [{ id: 'af-empty', title: 'No recent events', detail: 'GitHub API returned no events.', category: 'System', severity: 'info', time: formatTime(new Date()) }],
    analystFeed,
    businessFeed: businessFeed.length > 0 ? businessFeed : [{ id: 'bf-empty', title: 'No stories loaded', detail: 'HackerNews API returned no stories.', category: 'System', severity: 'info', time: formatTime(new Date()) }],
  };

  // ─── Tables ───────────────────────────────────────────────────────────

  const teamMatrix: TableRow[] = repos.slice(0, 6).map((r, i) => ({
    id: `repo-${i}`,
    workspace: r.name,
    owner: r.language ?? 'Unknown',
    status: r.open_issues_count > 100 ? 'Needs attention' : r.open_issues_count > 30 ? 'Review' : 'Healthy',
    coverage: r.stargazers_count,
    latency: r.open_issues_count,
    lastUpdated: timeAgo(r.pushed_at),
  }));

  const modelSegments: TableRow[] = coins.slice(0, 6).map((c, i) => ({
    id: `seg-${i}`,
    segment: c.name,
    owner: c.symbol.toUpperCase(),
    confidence: Math.round(50 + (c.price_change_percentage_24h ?? 0) * 5),
    momentum: Math.round(c.price_change_percentage_24h ?? 0),
    state: (c.price_change_percentage_24h ?? 0) > 2 ? 'Bullish' : (c.price_change_percentage_24h ?? 0) < -2 ? 'Bearish' : 'Neutral',
    lastUpdated: 'Live',
  }));

  const initiativeLedger: TableRow[] = coins.slice(4, 10).map((c, i) => ({
    id: `init-${i}`,
    initiative: c.name,
    owner: `#${c.market_cap_rank}`,
    confidence: Math.round(50 + (c.price_change_percentage_24h ?? 0) * 5),
    velocity: Math.round(c.total_volume / 1_000_000_000),
    state: (c.price_change_percentage_24h ?? 0) > 0 ? 'On track' : 'Watch',
    lastUpdated: 'Live',
  }));

  const tables: Record<string, TableRow[]> = {
    teamMatrix,
    modelSegments,
    initiativeLedger,
  };

  return { metrics, trends, comparisons, bulletSets, feeds, tables };
}

// ─── Utility ────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
