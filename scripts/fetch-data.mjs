// fetch-data.mjs — server-side fetch of public Taskmarket API data.
// Run: node scripts/fetch-data.mjs  (from repo root)
// Writes data/data.json with a "generatedAt" timestamp. No API key.
// Endpoints (https://api.taskmarket.dev):
//   /api/market/stats, /api/stats/breakdowns, /api/stats/platform-time-series,
//   /api/stats/activity-heatmap, /api/stats/activity-feed, /api/tasks
// Money in the API is integer micro-OUSD (1 OUSD = 1,000,000). We store OUSD
// numbers (micro / 1e6) so the page shows exactly what the API says.
// Distinct posters per week is computed from the /api/tasks list (requester
// field, createdAt), last 8 ISO weeks, per chain.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'data.json');
const BASE = 'https://api.taskmarket.dev/api';
const CHAINS = [
  { chainId: 4217, name: 'Tempo' },
  { chainId: 8453, name: 'Base' },
];
const MAX_TASK_PAGES = 20; // 100 tasks per page -> up to 2000 tasks per chain
const WEEKS_BACK = 8;

async function getJson(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 20000);
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'taskmarket-live-visualizer/1.0 (+https://taskmarket.dev)' } });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

const microToOusd = (v) => {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? Number(v) : v;
  if (!Number.isFinite(n)) return null;
  return n / 1e6;
};

function isoWeekKey(d) {
  // ISO week key YYYY-Www (Monday-based)
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (date.getUTCDay() + 6) % 7; // Mon=0
  date.setUTCDate(date.getUTCDate() - day + 3); // Thursday of this week
  const firstThu = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const fday = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - fday + 3);
  const week = 1 + Math.round((date - firstThu) / (7 * 86400000));
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function weekStartLabel(key) {
  const [y, w] = key.split('-W').map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const day = (jan4.getUTCDay() + 6) % 7;
  jan4.setUTCDate(jan4.getUTCDate() - day + 3); // Thursday of week 1
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - 3 + (w - 1) * 7);
  return monday.toISOString().slice(0, 10);
}

async function fetchChain(chainId) {
  const [stats, breakdowns, feed] = await Promise.all([
    getJson(`${BASE}/market/stats?chainId=${chainId}`),
    getJson(`${BASE}/stats/breakdowns?chainId=${chainId}`),
    getJson(`${BASE}/stats/activity-feed?chainId=${chainId}&limit=40`),
  ]);

  const series = {};
  for (const range of ['7d', '30d', '90d', 'all']) {
    const bucket = range === 'all' ? 'week' : 'day';
    const rows = await getJson(`${BASE}/stats/platform-time-series?chainId=${chainId}&range=${range}&bucket=${bucket}`);
    series[range] = rows.map((r) => ({
      bucket: r.bucket,
      tasksCreated: r.tasksCreated,
      completedTasks: r.completedTasks,
      newAgents: r.newAgents,
      activeAgents: r.activeAgents,
      rewardVolumeOusd: microToOusd(r.rewardVolume),
      paidVolumeOusd: microToOusd(r.paidVolume),
      settlements: r.settlements,
      ratings: r.ratings,
    }));
  }

  const [heatHour, heatMode] = await Promise.all([
    getJson(`${BASE}/stats/activity-heatmap?chainId=${chainId}&range=7d&dimension=hourOfWeek`),
    getJson(`${BASE}/stats/activity-heatmap?chainId=${chainId}&range=30d&dimension=mode`),
  ]);

  // Tasks paging for distinct posters per week + top posters.
  const cutoff = Date.now() - WEEKS_BACK * 7 * 86400000;
  const postersPerWeek = {}; // weekKey -> Set(requester)
  const posterCounts = {}; // requester -> task count in window
  let cursor = null;
  let pages = 0;
  let tasksSeen = 0;
  let oldestReached = false;
  do {
    const url = `${BASE}/tasks?chainId=${chainId}&sort=newest&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const page = await getJson(url);
    pages++;
    for (const t of page.tasks || []) {
      tasksSeen++;
      const created = Date.parse(t.createdAt);
      if (!Number.isFinite(created) || created < cutoff) { oldestReached = true; continue; }
      const key = isoWeekKey(new Date(created));
      (postersPerWeek[key] ||= new Set()).add(t.requester);
      posterCounts[t.requester] = (posterCounts[t.requester] || 0) + 1;
    }
    cursor = page.hasMore ? page.nextCursor : null;
  } while (cursor && !oldestReached && pages < MAX_TASK_PAGES);

  const weekKeys = Object.keys(postersPerWeek).sort();
  const postersWeekly = weekKeys.map((k) => ({ week: k, weekStart: weekStartLabel(k), distinctPosters: postersPerWeek[k].size }));
  const topPosters = Object.entries(posterCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([address, count]) => ({ address, count }));

  return {
    chainId,
    stats,
    breakdowns,
    series,
    heatmapHourOfWeek: heatHour,
    heatmapMode: heatMode,
    feed: (feed.items || []).map((i) => ({
      type: i.type,
      timestamp: i.timestamp,
      taskId: i.taskId,
      taskTitle: i.taskTitle,
      actor: i.actor,
      actorType: i.actorType,
      amountOusd: microToOusd(i.amount),
      rating: i.rating,
    })),
    postersWeekly,
    topPosters,
    tasksScanned: tasksSeen,
    tasksPages: pages,
  };
}

const generatedAt = new Date().toISOString();
const chains = {};
for (const c of CHAINS) {
  console.log(`fetching chain ${c.chainId} (${c.name})...`);
  chains[c.chainId] = await fetchChain(c.chainId);
  console.log(`  chain ${c.chainId}: series 7d=${chains[c.chainId].series['7d'].length} rows, feed=${chains[c.chainId].feed.length}, postersWeekly=${chains[c.chainId].postersWeekly.length} weeks, tasksScanned=${chains[c.chainId].tasksScanned}`);
}

const out = {
  generatedAt,
  generatedAtWib: new Date(Date.parse(generatedAt) + 7 * 3600000).toISOString().replace('T', ' ').slice(0, 19) + ' WIB',
  units: 'Money is OUSD (API micro-OUSD divided by 1,000,000).',
  endpoints: [
    '/api/market/stats?chainId=…',
    '/api/stats/breakdowns?chainId=…',
    '/api/stats/platform-time-series?chainId=…&range=7d|30d|90d|all&bucket=day|week',
    '/api/stats/activity-heatmap?chainId=…&range=7d|30d&dimension=hourOfWeek|mode',
    '/api/stats/activity-feed?chainId=…&limit=40',
    '/api/tasks?chainId=…&sort=newest&limit=100&cursor=… (distinct posters per week, last 8 weeks)',
  ],
  chains,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB) at ${generatedAt}`);
