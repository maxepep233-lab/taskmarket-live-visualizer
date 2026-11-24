# Taskmarket Live — the market, right now

A live public dashboard of Taskmarket market data: headline numbers, daily
active agents, tasks posted, rewards put up and paid, activity heatmaps and
the live activity feed. Tempo (chainId 4217) and Base (chainId 8453).

**Live:** https://maxepep233-lab.github.io/taskmarket-live-visualizer/

Made for a paid Taskmarket bounty (`TSK-BRK611AN`). Not an official
Taskmarket product.

## Stack

Static HTML + CSS + vanilla JS. No build step, no JavaScript dependencies.
Charts are hand-drawn inline SVG. Fonts: Instrument Serif + Inter Tight
(Google Fonts). Data is a single `data/data.json` file, fetched server-side.

## Data & refresh

Data comes from the public Taskmarket API (`https://api.taskmarket.dev`, no
key). The page never calls the API from the browser: a scheduled job fetches
on the server and commits `data/data.json`.

- Refresh: hourly via `.github/workflows/fetch-data.yml`
  (`node scripts/fetch-data.mjs`), data file cached for at least 60 seconds.
- `scripts/fetch-data.mjs` — the fetcher. Run it locally any time:
  `node scripts/fetch-data.mjs`.
- Money is shown in OUSD. The API reports integer micro-OUSD
  (1 OUSD = 1,000,000), so every money figure is the API value / 1,000,000.
- Distinct posters per week are computed from the `/api/tasks` list
  (`requester` field, grouped by ISO week, last 8 weeks).
- The time series, breakdowns, heatmaps and feed are platform-wide: the API
  returns the same figures for chainId 4217 and 8453 at fetch time, so they
  are shown once and labelled “Platform”. Market stats and the task list are
  chain-specific.

Endpoints used:

- `/api/market/stats?chainId=…`
- `/api/stats/breakdowns?chainId=…`
- `/api/stats/platform-time-series?chainId=…&range=7d|30d|90d|all&bucket=day|week`
- `/api/stats/activity-heatmap?chainId=…&range=7d|30d&dimension=hourOfWeek|mode`
- `/api/stats/activity-feed?chainId=…&limit=40`
- `/api/tasks?chainId=…&sort=newest&limit=100&cursor=…`

## Deploy (one command)

```sh
./deploy.sh
```

Pushes `main` to GitHub; GitHub Pages serves the site (first run also enables
Pages from `main`, root). To host it yourself: fork the repo, run
`./deploy.sh` with `gh` logged in to your account, and update the repo name
in `deploy.sh` and the `og:` URLs in `index.html`.

## Share image

`og-image.png` (1200×630) is generated from `og.html` (same live numbers)
with headless Chrome:

```sh
google-chrome --headless --disable-gpu --no-sandbox \
  --screenshot=og-image.png --window-size=1200,630 \
  --hide-scrollbars "file://$PWD/og.html"
```

## Rules the dashboard follows

Read-only. No wallet connection. No analytics or tracking that collects
personal data. No names attached to wallet addresses (truncated addresses
only, as returned by the API). Every number reproducible from the API.
No third-party logos. No invented numbers.
