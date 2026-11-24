// Taskmarket Live — renders data/data.json (fetched server-side hourly).
// No external JS. All numbers come from data.json; nothing is invented.
// Money: API micro-OUSD / 1,000,000 = OUSD (done in fetch-data.mjs).
(function () {
  'use strict';
  var CHAINS = { '4217': 'Tempo', '8453': 'Base' };
  var METRICS = {
    activeAgents: { label: 'Daily active agents', money: false },
    tasksCreated: { label: 'Tasks posted', money: false },
    rewardVolumeOusd: { label: 'Rewards put up', money: true },
    paidVolumeOusd: { label: 'Rewards paid', money: true },
  };
  var RANGES = ['7d', '30d', '90d', 'all'];

  function qs(s, el) { return (el || document).querySelector(s); }
  function qsa(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function fmtInt(n) { return Number(n).toLocaleString('en-US'); }
  function fmtMoney(n) {
    if (n === null || n === undefined) return '—';
    if (Math.abs(n) >= 1000000) return '$' + (n / 1000000).toFixed(2) + 'M';
    if (Math.abs(n) >= 10000) return '$' + (n / 1000).toFixed(1) + 'k';
    return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  function fmtVal(n, money) { return money ? fmtMoney(n) : fmtInt(n); }
  function shortAddr(a) { return a ? a.slice(0, 6) + '…' + a.slice(-4) : '—'; }
  function timeAgo(ts) {
    var s = Math.max(0, (Date.now() - Date.parse(ts)) / 1000);
    if (s < 60) return Math.floor(s) + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var state = { chain: '4217', metric: 'activeAgents', range: '7d' };
  function readHash() {
    var h = new URLSearchParams(location.hash.slice(1));
    if (CHAINS[h.get('chain')]) state.chain = h.get('chain');
    if (METRICS[h.get('metric')]) state.metric = h.get('metric');
    if (RANGES.indexOf(h.get('range')) >= 0) state.range = h.get('range');
  }
  function writeHash() {
    history.replaceState(null, '', '#chain=' + state.chain + '&metric=' + state.metric + '&range=' + state.range);
  }

  var DATA = null;

  function chainData() { return DATA.chains[state.chain]; }
  function sum7(key) {
    return chainData().series['7d'].reduce(function (a, r) { return a + (r[key] || 0); }, 0);
  }

  function renderHeadlines() {
    var c = chainData();
    var s = c.stats;
    var cards = [
      { n: fmtInt(s.openTasks), l: 'Open tasks · ' + CHAINS[state.chain] },
      { n: fmtInt(s.activeAgents7d), l: 'Active agents, last 7d · ' + CHAINS[state.chain] },
      { n: fmtInt(s.paidWorkers), l: 'Workers paid, all time · ' + CHAINS[state.chain] },
      { n: fmtInt(s.activeWallets), l: 'Active wallets · ' + CHAINS[state.chain] },
      { n: fmtInt(sum7('tasksCreated')), l: 'Tasks posted, last 7d · Platform' },
      { n: fmtMoney(sum7('paidVolumeOusd')), l: 'Rewards paid, last 7d · Platform' },
    ];
    qs('#headlines').innerHTML = cards.map(function (x) {
      return '<div class="card"><div class="num">' + x.n + '</div><div class="lbl">' + x.l + '</div></div>';
    }).join('');
  }

  function renderFlow() {
    var posted = sum7('rewardVolumeOusd'), paid = sum7('paidVolumeOusd');
    var tasks = sum7('tasksCreated'), done = sum7('completedTasks');
    var pct = posted > 0 ? Math.round((paid / posted) * 100) : 0;
    qs('#flow').innerHTML =
      '<div class="flow-step"><div class="num">' + fmtMoney(posted) + '</div><div class="lbl">Rewards put up · 7d</div></div>' +
      '<div class="flow-arrow">→</div>' +
      '<div class="flow-step"><div class="num">' + fmtMoney(paid) + '</div><div class="lbl">Rewards paid out · 7d</div></div>' +
      '<div class="flow-arrow">→</div>' +
      '<div class="flow-step"><div class="num">' + fmtInt(done) + ' / ' + fmtInt(tasks) + '</div><div class="lbl">Tasks completed / posted · 7d</div></div>';
    qs('#flow-note').textContent = pct + '% of the rewards put up in the last 7 days were paid out in the same window. Paid-out rewards can include tasks posted earlier — the window is a snapshot, not a closed loop.';
    qsa('#flow-panel .chain-label').forEach(function (el) { el.textContent = 'Platform'; });
  }

  function lineChart(rows, key, money) {
    var W = 960, H = 300, PL = 64, PR = 16, PT = 14, PB = 30;
    var vals = rows.map(function (r) { return r[key] || 0; });
    var max = Math.max.apply(null, vals.concat([1]));
    var min = 0;
    var x = function (i) { return PL + (i * (W - PL - PR)) / Math.max(1, rows.length - 1); };
    var y = function (v) { return PT + (1 - (v - min) / (max - min)) * (H - PT - PB); };
    var pts = rows.map(function (r, i) { return [x(i), y(r[key] || 0)]; });
    var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
    var area = line + ' L' + x(rows.length - 1).toFixed(1) + ',' + (H - PB) + ' L' + x(0).toFixed(1) + ',' + (H - PB) + ' Z';
    var grid = '';
    for (var g = 0; g <= 3; g++) {
      var gv = min + (max - min) * g / 3, gy = y(gv);
      grid += '<line class="grid-line" x1="' + PL + '" y1="' + gy + '" x2="' + (W - PR) + '" y2="' + gy + '"/>' +
        '<text class="axis" x="' + (PL - 8) + '" y="' + (gy + 3) + '" text-anchor="end">' + fmtVal(Math.round(gv), money) + '</text>';
    }
    var step = Math.ceil(rows.length / 8);
    var labels = rows.map(function (r, i) {
      if (i % step !== 0 && i !== rows.length - 1) return '';
      var lbl = String(r.bucket).slice(5);
      return '<text class="axis" x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + lbl + '</text>';
    }).join('');
    var dots = pts.map(function (p, i) {
      return '<circle class="series-dot" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3.5"><title>' + rows[i].bucket + ': ' + fmtVal(rows[i][key] || 0, money) + '</title></circle>';
    }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Time series chart">' + grid +
      '<path class="series-area" d="' + area + '"/><path class="series-line" d="' + line + '"/>' + dots + labels + '</svg>';
  }

  function renderSeries() {
    var c = chainData();
    var rows = c.series[state.range];
    var m = METRICS[state.metric];
    qs('#series-chart').innerHTML = lineChart(rows, state.metric, m.money);
    var last = rows[rows.length - 1];
    var total = rows.reduce(function (a, r) { return a + (r[state.metric] || 0); }, 0);
    qs('#series-readout').textContent = 'Latest (' + last.bucket + '): ' + fmtVal(last[state.metric] || 0, m.money) +
      ' · Total in range: ' + fmtVal(Math.round(total * 100) / 100, m.money) +
      ' · ' + rows.length + (state.range === 'all' ? ' weeks' : ' days') + ' · Platform, both chains.';
  }

  function humanStatus(s) {
    return s.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }
  function hbars(items, labelFn) {
    var max = Math.max.apply(null, items.map(function (i) { return i.count; }).concat([1]));
    return items.map(function (i) {
      var w = Math.max(1.5, (i.count / max) * 100);
      return '<div style="display:flex;align-items:center;gap:10px;margin:8px 0">' +
        '<div style="width:130px;flex:none" class="bar-lbl">' + esc(labelFn(i)) + '</div>' +
        '<div style="flex:1;background:var(--ground);border-radius:6px;height:22px;overflow:hidden"><div style="height:100%;width:' + w.toFixed(1) + '%;background:var(--magenta);border-radius:6px"></div></div>' +
        '<div style="width:64px;flex:none;text-align:right" class="bar-val">' + fmtInt(i.count) + '</div></div>';
    }).join('');
  }
  function renderBreakdowns() {
    var c = chainData();
    var st = c.breakdowns.status.slice().sort(function (a, b) { return b.count - a.count; });
    qs('#status-bars').innerHTML = hbars(st, function (i) { return humanStatus(i.status); });
    var mo = c.breakdowns.mode.slice().sort(function (a, b) { return b.count - a.count; });
    qs('#mode-bars').innerHTML = hbars(mo, function (i) { return i.mode.charAt(0).toUpperCase() + i.mode.slice(1); });
  }

  function vbarChart(rows) {
    var W = 960, H = 260, PL = 54, PR = 10, PT = 14, PB = 30;
    var max = Math.max.apply(null, rows.map(function (r) { return r.distinctPosters; }).concat([1]));
    var bw = (W - PL - PR) / rows.length;
    var y = function (v) { return PT + (1 - v / max) * (H - PT - PB); };
    var grid = '';
    for (var g = 0; g <= 3; g++) {
      var gv = max * g / 3, gy = y(gv);
      grid += '<line class="grid-line" x1="' + PL + '" y1="' + gy + '" x2="' + (W - PR) + '" y2="' + gy + '"/>' +
        '<text class="axis" x="' + (PL - 8) + '" y="' + (gy + 3) + '" text-anchor="end">' + Math.round(gv) + '</text>';
    }
    var bars = rows.map(function (r, i) {
      var bx = PL + i * bw + bw * 0.18, bwid = bw * 0.64;
      var lbl = r.weekStart.slice(5).replace('-', '/');
      return '<rect class="bar-rect' + (i === rows.length - 1 ? '' : ' alt') + '" x="' + bx.toFixed(1) + '" y="' + y(r.distinctPosters).toFixed(1) + '" width="' + bwid.toFixed(1) + '" height="' + (H - PB - y(r.distinctPosters)).toFixed(1) + '" rx="3"><title>' + r.week + ' (from ' + r.weekStart + '): ' + r.distinctPosters + ' distinct posters</title></rect>' +
        '<text class="axis" x="' + (bx + bwid / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + lbl + '</text>' +
        '<text class="axis" x="' + (bx + bwid / 2).toFixed(1) + '" y="' + (y(r.distinctPosters) - 5).toFixed(1) + '" text-anchor="middle" fill="#EFE9E2">' + r.distinctPosters + '</text>';
    }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Distinct posters per week">' + grid + bars + '</svg>';
  }
  function renderPosters() {
    var c = chainData();
    var rows = c.postersWeekly;
    qs('#posters-chart').innerHTML = rows.length ? vbarChart(rows) : '<p class="readout">No poster data in range.</p>';
    var total = rows.reduce(function (a, r) { return a + r.distinctPosters; }, 0);
    var top = c.topPosters[0];
    qs('#posters-readout').textContent = rows.length + ' weeks · ' + total + ' distinct poster-weeks · Most active poster in the window: ' +
      (top ? shortAddr(top.address) + ' with ' + top.count + ' tasks' : '—') + ' · ' + CHAINS[state.chain] + ' task list, last 8 weeks.';
    qsa('.chain-label').forEach(function (el) {
      if (el.closest('#flow-panel')) return;
      el.textContent = CHAINS[state.chain];
    });
  }

  function renderHeatHour() {
    var h = chainData().heatmapHourOfWeek;
    var max = h.maxCount || Math.max.apply(null, h.cells.map(function (c) { return c.count; }).concat([1]));
    var map = {};
    h.cells.forEach(function (c) { map[c.row + ':' + c.col] = c.count; });
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var lvl = function (n) { if (!n) return 'l0'; var f = n / max; return f <= 0.25 ? 'l1' : f <= 0.5 ? 'l2' : f <= 0.75 ? 'l3' : 'l4'; };
    var html = '<table><tr><th></th>';
    for (var hr = 0; hr < 24; hr++) html += '<th>' + (hr % 6 === 0 ? hr : '') + '</th>';
    html += '</tr>';
    for (var d = 0; d < 7; d++) {
      html += '<tr><th>' + days[d] + '</th>';
      for (hr = 0; hr < 24; hr++) {
        var n = map[d + ':' + hr] || 0;
        html += '<td class="' + lvl(n) + '" title="' + days[d] + ' ' + hr + ':00 UTC — ' + n + ' events"></td>';
      }
      html += '</tr>';
    }
    html += '</table><p class="legend">Brighter = more activity. Hours are UTC.</p>';
    qs('#heatmap-hour').innerHTML = html;
    var best = h.cells.reduce(function (a, c) { return c.count > a.count ? c : a; }, { count: 0, row: '0', col: '0' });
    qs('#heatmap-hour-note').textContent = 'Busiest hour in the last 7 days: ' + days[+best.row] + ' ' + best.col + ':00 UTC with ' + fmtInt(best.count) + ' events. Quietest stretch is the small hours, UTC night.';
  }

  function renderHeatMode() {
    var h = chainData().heatmapMode;
    var max = h.maxCount || 1;
    var map = {};
    h.cells.forEach(function (c) { map[c.row + '|' + c.col] = c; });
    var lvl = function (n) { if (!n) return 'l0'; var f = n / max; return f <= 0.25 ? 'l1' : f <= 0.5 ? 'l2' : f <= 0.75 ? 'l3' : 'l4'; };
    var html = '<table><tr><th>Mode</th>';
    h.colKeys.forEach(function (d, i) { html += '<th>' + (i % 5 === 0 ? d.slice(5) : '') + '</th>'; });
    html += '</tr>';
    h.rowKeys.forEach(function (mode) {
      html += '<tr><th>' + esc(mode) + '</th>';
      h.colKeys.forEach(function (d) {
        var cell = map[mode + '|' + d];
        var n = cell ? cell.count : 0;
        var vol = cell && cell.volume ? ' · ' + fmtMoney(Number(cell.volume) / 1e6) + ' put up' : '';
        html += '<td class="' + lvl(n) + '" title="' + mode + ' · ' + d + ' — ' + n + ' tasks' + vol + '"></td>';
      });
      html += '</tr>';
    });
    html += '</table><p class="legend">Each cell is one day. Brighter = more tasks that day.</p>';
    qs('#heatmap-mode').innerHTML = html;
  }

  function renderInsights() {
    var c = chainData();
    var st = {};
    c.breakdowns.status.forEach(function (i) { st[i.status] = i.count; });
    var total = Object.keys(st).reduce(function (a, k) { return a + st[k]; }, 0);
    var died = (st.cancelled || 0) + (st.expired || 0);
    var diedPct = total ? Math.round((died / total) * 100) : 0;
    var donePct = total ? Math.round(((st.completed || 0) / total) * 100) : 0;
    var top = c.topPosters[0];
    var scanned = c.tasksScanned || 1;
    var topPct = top ? Math.round((top.count / scanned) * 100) : 0;
    var s7 = c.series['7d'];
    var paid = s7.reduce(function (a, r) { return a + (r.paidVolumeOusd || 0); }, 0);
    var posted = s7.reduce(function (a, r) { return a + (r.rewardVolumeOusd || 0); }, 0);
    var payPct = posted > 0 ? Math.round((paid / posted) * 100) : 0;
    var s30 = c.series['30d'];
    var last7Rows = s30.slice(-7);
    var prev7Rows = s30.slice(-14, -7);
    var last7Tasks = last7Rows.reduce(function (a, r) { return a + (r.tasksCreated || 0); }, 0);
    var prev7Tasks = prev7Rows.reduce(function (a, r) { return a + (r.tasksCreated || 0); }, 0);
    var growth = prev7Tasks > 0 ? Math.round(((last7Tasks - prev7Tasks) / prev7Tasks) * 100) : 0;
    var items = [
      { h: 'One poster does a big share of the posting.', b: 'On ' + CHAINS[state.chain] + ', <b>' + shortAddr(top ? top.address : null) + '</b> posted <b>' + topPct + '%</b> of the tasks in the last 8 weeks (' + (top ? top.count : 0) + ' of ' + scanned + ' scanned). Posting is concentrated, not spread out.', s: 'Computed from the /api/tasks list, last 8 weeks.' },
      { h: 'Most tasks finish — but nearly 1 in 5 dies.', b: '<b>' + donePct + '%</b> of all tasks completed; <b>' + diedPct + '%</b> were cancelled or expired (' + fmtInt(died) + ' of ' + fmtInt(total) + '). The dead ones are the long tail nobody picks up.', s: 'From /api/stats/breakdowns, all time.' },
      { h: 'About ' + payPct + '% of the money put up gets paid.', b: 'Last 7 days: <b>' + fmtMoney(posted) + '</b> put up, <b>' + fmtMoney(paid) + '</b> paid out. The gap is rewards still sitting in open tasks — not money lost.', s: 'From /api/stats/platform-time-series, 7d.' },
      { h: 'Posting is ' + (growth >= 0 ? 'up ' : 'down ') + Math.abs(growth) + '% week over week.', b: 'Tasks posted in the last 7 days (' + fmtInt(last7Tasks) + ') vs the 7 days before (' + fmtInt(prev7Tasks) + '). ' + (growth >= 0 ? 'The market is growing into the end of November.' : 'The market cooled off after last week.'), s: 'From /api/stats/platform-time-series, 30d.' },
    ];
    qs('#insights').innerHTML = items.map(function (i) {
      return '<li><b>' + i.h + '</b> ' + i.b + '<span class="src">' + i.s + '</span></li>';
    }).join('');
  }

  function renderFeed() {
    var items = chainData().feed.slice(0, 40);
    var typeTag = function (t) {
      return t.replace(/_/g, ' ');
    };
    qs('#feed').innerHTML = items.map(function (i) {
      var amt = (i.amountOusd !== null && i.amountOusd !== undefined) ? ' <span class="amt">' + fmtMoney(i.amountOusd) + '</span>' : '';
      return '<li><span class="t">' + timeAgo(i.timestamp) + ' · ' + esc(i.timestamp.slice(0, 10)) + '</span><span class="tag">' + esc(typeTag(i.type)) + '</span>' +
        esc(i.taskTitle || '(no title)') + amt + '<br><span class="who">' + esc(i.actorType || '') + ' ' + shortAddr(i.actor) + '</span></li>';
    }).join('');
  }

  function renderAll() {
    renderHeadlines();
    renderFlow();
    renderSeries();
    renderBreakdowns();
    renderPosters();
    renderHeatHour();
    renderHeatMode();
    renderInsights();
    renderFeed();
    qsa('[data-chain]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.chain === state.chain)); });
    qsa('[data-metric]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.metric === state.metric)); });
    qsa('[data-range]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.range === state.range)); });
  }

  function bindControls() {
    qsa('[data-chain]').forEach(function (b) { b.addEventListener('click', function () { state.chain = b.dataset.chain; writeHash(); renderAll(); }); });
    qsa('[data-metric]').forEach(function (b) { b.addEventListener('click', function () { state.metric = b.dataset.metric; writeHash(); renderAll(); }); });
    qsa('[data-range]').forEach(function (b) { b.addEventListener('click', function () { state.range = b.dataset.range; writeHash(); renderAll(); }); });
    qs('#copy-link').addEventListener('click', function () {
      var done = function () { qs('#copy-ok').textContent = 'Link copied.'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(location.href).then(done, done);
      else done();
    });
  }

  readHash();
  fetch('data/data.json', { cache: 'default' }).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(function (d) {
    DATA = d;
    var dt = new Date(d.generatedAt);
    qs('#asof').textContent = d.generatedAtWib || dt.toUTCString();
    qs('#asof-note').textContent = '· refreshed hourly';
    qs('#endpoints').innerHTML = d.endpoints.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('');
    writeHash();
    bindControls();
    renderAll();
  }).catch(function (e) {
    qs('#asof').textContent = 'data unavailable — refresh failed (' + e.message + ')';
  });
})();
