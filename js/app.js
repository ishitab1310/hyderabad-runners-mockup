/* Browser stand-in for generator/ ingest/ pipeline/ engine/ api/ of the real repo (spec issues #3-#19).
   Same endpoint shapes as the planned FastAPI: needsYou, runner, global, postWeek, setNote, act, undo.
   The engine never reads `lab` (ground-truth labels). Runner IDs are salted hashes; UI shows "Runner 014". */
(function (w) {
'use strict';
var G = [['Saturday Long Run'], ['Couch-to-5K'], ['Sunrise 5K'], ['Sunday Social Run'], ['City Loop 5.2K'], ['Wednesday Track']],
  SZ = [12, 12, 12, 10, 10, 4], WK = 20, KEY = 'hr-demo-v2', MINK = 5, OFF = 4,
  ST = { engaged: 'Engaged', declining: 'Declining', disengaged: 'Disengaged', recovering: 'Recovering', not_enough_data: 'Not enough data' },
  PL = { steady: 'Steady', slow_fade: 'Slow fade', sudden_stop: 'Sudden stop', early_drop_off: 'Early drop-off', on_and_off: 'On and off', comeback: 'Comeback', new_joiner: 'New joiner', too_early: 'Too early to name' },
  NEXT = { sudden_stop: 'Attendance stopped abruptly after a steady run. A personal call is usually better than a group message.', slow_fade: 'Attendance has been slipping. A friendly check-in or a buddy run could help.', early_drop_off: 'Came for a few weeks after joining, then stopped. A short, low-pressure message about getting back in works well.', on_and_off: 'They come in blocks. This may be their normal rhythm, so you may not need to act yet.', comeback: 'Back after a break. A quick welcome-back goes a long way.', new_joiner: 'Joined recently. Too early to read much into it.', steady: 'Nothing to do. Attendance matches their usual level.', too_early: 'Not enough history to name a pattern yet.' },
  ACT = { message: 'Messaged', called: 'Called', not_concern: 'Not a concern', snooze: 'Snoozed 2 weeks' };

/* ---- generator (seeded) ---- */
function rng(s) { return function () { s |= 0; s = s + 0x6D2B79F5 | 0; var t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }
var r = rng(11), AR = ['steady', 'fade', 'sudden', 'early', 'onoff', 'comeback', 'new'], MIX = [.35, .15, .1, .15, .1, .1, .05], MIXC = [.2, .1, .05, .35, .1, .1, .1];
function pick(ws) { var x = r(), c = 0; for (var i = 0; i < ws.length; i++) { c += ws[i]; if (x < c) return AR[i]; } return 'steady'; }
var FIRST = ['steady', 'steady', 'fade', 'sudden', 'early', 'comeback', 'onoff'], RAIN = { 6: 'Heavy rain', 13: 'Festival' };
var R = [], att = {}, lab = {}, num = 0;
SZ.forEach(function (sz, g) {
  for (var k = 0; k < sz; k++) {
    var a = g === 0 && k < FIRST.length ? FIRST[k] : pick(g === 1 ? MIXC : MIX), b = 2 + Math.floor(r() * 3), j = 1, cw = null, L = 0;
    if (a === 'fade') cw = 6 + Math.floor(r() * 6);
    if (a === 'sudden') cw = 15 + Math.floor(r() * 4);
    if (a === 'early') { j = (g === 0 ? 8 : 2) + Math.floor(r() * 5); cw = j + 4; }
    if (a === 'comeback') { cw = 11 + Math.floor(r() * 3); L = 4; }
    if (a === 'new') j = 17 + Math.floor(r() * 3);
    if (a === 'onoff') cw = 3;
    var id = hash('salt|' + g + '|' + k); num++;
    R.push({ id: id, num: num, g: g, group: G[g][0], level: ['beginner', 'intermediate', 'advanced'][g === 1 ? 0 : Math.floor(r() * 3)], slot: r() < .6 ? 'morning' : 'evening', code: 'Runner ' + (num < 10 ? '00' : num < 100 ? '0' : '') + num });
    lab[id] = { archetype: a, change_week: cw }; att[id] = {};
    for (var wk = j; wk <= WK; wk++) {
      var lam = b;
      if (a === 'fade' && wk > cw) lam = Math.max(0, b - (wk - cw) * b / 7);
      if (a === 'sudden' && wk >= cw) lam = 0;
      if (a === 'early' && wk >= cw) lam = 0;
      if (a === 'comeback' && wk >= cw && wk < cw + L) lam = 0;
      if (a === 'onoff' && Math.floor((wk - 1) / 3) % 2) lam = 0.2;
      if (RAIN[wk]) lam *= .3;
      var v = Math.round(lam + (r() - .5) * 1.2); if (r() < .06) v = 0;
      att[id][wk] = Math.max(0, Math.min(OFF, v));
    }
  }
});
var byId = {}; R.forEach(function (x) { byId[x.id] = x; });
var notes = {}, acts = [], nx = 1, latest = WK, log = { e: {}, n: {} };
Object.keys(RAIN).forEach(function (k) { notes[k] = { u: true, note: RAIN[k] }; });
try {
  var sv = JSON.parse(w.localStorage.getItem(KEY) || 'null');
  if (sv) {
    log = sv.log; acts = sv.acts; nx = sv.nx;
    Object.keys(log.e).forEach(function (k) { Object.keys(log.e[k]).forEach(function (i) { att[i][k] = log.e[k][i]; if (+k > latest) latest = +k; }); });
    Object.keys(log.n).forEach(function (k) { if (log.n[k].u) notes[k] = log.n[k]; else delete notes[k]; });
  }
} catch (e) { }
function save() { try { w.localStorage.setItem(KEY, JSON.stringify({ log: log, acts: acts, nx: nx })); } catch (e) { } }

/* ---- engine (#10-#14): own baseline, unusual weeks ignored, rule-based state with reason ---- */
function mean(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : 0; }
function f1(x) { return (Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, ''); }
function noGaps(y) { var o = [], i = 0; while (i < y.length) { var j = i; if (!y[i]) { while (j + 1 < y.length && !y[j + 1]) j++; if (j - i < 2) for (var k = i; k <= j; k++) o.push(0); } else o.push(y[i]); i = j + 1; } return o; }
function analyse(rec, un) {
  var v = rec.filter(function (x) { return !un[x.w]; }), y = v.map(function (x) { return x.a; }), n = y.length,
    o = { state: 'not_enough_data', pat: 'too_early', cw: null, flag: false, lapsed: false, base: null, rc: null, tz: 0, ign: rec.length - n };
  var last = 0; rec.forEach(function (x) { if (x.a > 0) last = x.w; }); o.ago = last ? latest - last : null;
  if (n < 4) { o.reason = 'Only ' + n + ' week' + (n === 1 ? '' : 's') + ' of history. Needs at least 4 before a state can be set.'; return o; }
  var rc = y.slice(-4), pr = noGaps(y.slice(0, n - 4)), base = pr.length >= 2 ? mean(pr.slice(0, 8)) : mean(y), rm = mean(rc), ratio = base > 0 ? rm / base : 1, tz = 0;
  for (var i = n - 1; i >= 0 && !y[i]; i--) tz++;
  var prior = n >= 8 ? mean(y.slice(n - 8, n - 4)) : null, low = rc.filter(function (x) { return x < .6 * base; }).length, st;
  o.base = base; o.rc = rm; o.tz = tz;
  if (base >= 1 && tz >= 3) { st = 'disengaged'; o.reason = 'No sessions in the last ' + tz + ' weeks. Usually ' + f1(base) + ' a week.'; }
  else if (base >= 1 && ratio < .3) { st = 'disengaged'; o.reason = 'Averaged ' + f1(rm) + ' a week over the last 4 weeks. Usually ' + f1(base) + '.'; }
  else if (prior != null && base >= 1 && prior < .5 * base && ratio >= .6) { st = 'recovering'; o.reason = 'Back to ' + f1(rm) + ' a week over the last 4 weeks after a quiet spell. Usually ' + f1(base) + '.'; }
  else if (base >= 1 && ratio < .7 && low >= 2) { st = 'declining'; o.reason = 'Came ' + f1(rm * 4) + ' of the last 4 weeks\' sessions-equivalent: ' + f1(rm) + ' a week. Usually ' + f1(base) + '.'; }
  else { st = 'engaged'; o.reason = 'On track: ' + f1(rm) + ' a week over the last 4 weeks. Usually ' + f1(base) + '.'; }
  o.state = st; o.lapsed = st === 'disengaged' && tz >= 6; o.flag = (st === 'declining' || st === 'disengaged') && !o.lapsed;
  if (o.lapsed) o.reason = 'No sessions for ' + tz + ' weeks. Treated as lapsed, not flagged.';
  // pattern (#13) and change point (#14)
  var nz = y.filter(Boolean).length, zb = 0, run = 0;
  y.forEach(function (x, k) { if (!x) run++; else { if (run >= 2) zb++; run = 0; } }); if (run >= 2) zb++;
  var wk = function (k) { return v[k] ? v[k].w : null; };
  if (n < 8) o.pat = st === 'disengaged' ? 'too_early' : 'new_joiner';
  else if (tz >= 2) {
    var bef = y.slice(Math.max(0, n - tz - 6), n - tz);
    o.pat = nz <= 6 ? 'early_drop_off' : (mean(bef) >= .62 * base ? 'sudden_stop' : 'slow_fade'); o.cw = wk(n - tz);
  } else if (st === 'recovering') { o.pat = 'comeback'; for (var q = n - 5; q > 0 && y[q]; q--); o.cw = wk(Math.max(0, q)); }
  else if (zb >= 2 || (zb === 1 && base < 1.2)) o.pat = 'on_and_off';
  else if (st === 'declining') { o.pat = 'slow_fade'; for (var s = 0; s < n && y[s] >= .7 * base; s++); o.cw = wk(s); }
  else o.pat = 'steady';
  return o;
}

/* ---- API (#8, #16-#19) ---- */
function rec(id) { return Object.keys(att[id]).map(Number).sort(function (a, b) { return a - b; }).map(function (k) { return { w: k, a: att[id][k] }; }); }
function un() { var m = {}; Object.keys(notes).forEach(function (k) { if (notes[k].u) m[k] = 1; }); return m; }
function A(x) { return analyse(rec(x.id), un()); }
function lastAct(id) { var a = acts.filter(function (x) { return x.id_r === id && !x.undone; }); return a.length ? a[a.length - 1] : null; }
function outcome(a) {
  if (a.type === 'not_concern' || a.type === 'snooze') return null;
  var s = 0, n = 0; rec(a.id_r).forEach(function (x) { if (x.w > a.w) { s += x.a; n++; } });
  return !n ? 'Waiting for next week' : (s > 0 ? 'Back: ' + s + ' session' + (s === 1 ? '' : 's') + ' since' : 'Not back yet');
}
function dec(a) { return { id: a.id, type: a.type, label: ACT[a.type], w: a.w, outcome: outcome(a) }; }
function view(x, a) {
  a = a || A(x); var la = lastAct(x.id), h = [];
  for (var k = latest - 7; k <= latest; k++) h.push({ w: k, a: att[x.id][k] == null ? null : att[x.id][k], u: !!(notes[k] && notes[k].u) });
  var aside = la && ((la.type === 'not_concern' && a.state === la.st) || (la.type === 'snooze' && latest < la.w + 2));
  return { id: x.id, code: x.code, group: x.group, g: x.g, state: a.state, sl: ST[a.state], pat: a.pat, pl: PL[a.pat], reason: a.reason, flag: a.flag, lapsed: a.lapsed, ago: a.ago,
    usual: a.base == null ? 0 : Math.round(a.base * 10) / 10, hist: h, sum: h.reduce(function (t, z) { return t + (z.a || 0); }, 0), action: la ? dec(la) : null, aside: !!aside, cw: a.cw, ign: a.ign };
}
function snap() { var s = {}; R.forEach(function (x) { var a = A(x); s[x.id] = { st: a.state, f: a.flag }; }); return s; }
function diff(b, a) { var o = []; R.forEach(function (x) { if (b[x.id].st !== a[x.id].st || b[x.id].f !== a[x.id].f) o.push({ id: x.id, code: x.code, g: x.g, from: b[x.id].st, to: a[x.id].st, now: !b[x.id].f && a[x.id].f, cleared: b[x.id].f && !a[x.id].f }); }); return o; }
function weekAvg(rs, k) { var v = []; rs.forEach(function (x) { if (att[x.id][k] != null) v.push(att[x.id][k]); }); return { w: k, n: v.length, avg: v.length ? mean(v) : null, u: !!(notes[k] && notes[k].u), note: notes[k] ? notes[k].note : '' }; }

w.HR = {
  ST: ST, PL: PL, ACT: ACT, OFF: OFF, MINK: MINK,
  needsYou: function () {
    var rs = R.filter(function (x) { return x.g === 0; }), vs = rs.map(function (x) { return view(x); }), rk = { disengaged: 0, declining: 1 };
    var needs = vs.filter(function (v) { return v.flag && !v.aside; }).sort(function (a, b) { return rk[a.state] - rk[b.state] || a.ago - b.ago; });
    var c = function (s) { return vs.filter(function (v) { return v.state === s; }).length; }, wks = [];
    for (var k = latest; k > latest - 6 && k >= 1; k--) wks.push(weekAvg(rs, k));
    return { latest: latest, group: G[0][0], size: rs.length, needs: needs, aside: vs.filter(function (v) { return v.flag && v.aside; }), runners: vs, weeks: wks,
      stats: { runners: rs.length, needs: needs.length, declining: c('declining'), disengaged: c('disengaged'), recovering: c('recovering') } };
  },
  runner: function (id) {
    var x = byId[id]; if (!x) throw new Error('Runner not found'); var a = A(x), v = view(x, a);
    v.weeks = rec(id).map(function (z) { return { w: z.w, a: z.a, u: !!(notes[z.w] && notes[z.w].u), note: notes[z.w] ? notes[z.w].note : '' }; });
    v.base = a.base; v.next = NEXT[a.pat]; v.about = x.group + ' · ' + x.level + ' · ' + x.slot + ' runs';
    v.actions = acts.filter(function (z) { return z.id_r === id && !z.undone; }).map(dec).reverse(); v.latest = latest; return v;
  },
  global: function () {
    var all = R.map(function (x) { return { x: x, a: A(x) }; }), cnt = {};
    all.forEach(function (z) { cnt[z.a.pat] = (cnt[z.a.pat] || 0) + 1; });
    var pats = Object.keys(PL).map(function (k) { var n = cnt[k] || 0; return { label: PL[k], n: n, hidden: n < MINK }; });
    var grp = G.map(function (g, i) { var m = all.filter(function (z) { return z.x.g === i; }), d = m.filter(function (z) { return z.a.state === 'disengaged'; }).length; return { name: g[0], size: m.length, d: d, hidden: m.length < MINK }; });
    var wk = []; for (var k = 1; k <= latest; k++) wk.push(weekAvg(R, k));
    return { latest: latest, total: R.length, flagged: all.filter(function (z) { return z.a.flag; }).length, active: all.filter(function (z) { return !z.a.lapsed; }).length, pats: pats, groups: grp, weekly: wk };
  },
  postWeek: function (k, e, u, note) {
    if (!(k >= 1) || k > latest + 1) throw new Error('Next week to log is ' + (latest + 1) + '.');
    var b = snap(); log.e[k] = log.e[k] || {};
    Object.keys(e).forEach(function (i) { var n = e[i]; if (!Number.isInteger(n) || n < 0 || n > OFF) throw new Error('Sessions must be a whole number from 0 to ' + OFF + '.'); });
    Object.keys(e).forEach(function (i) { att[i][k] = e[i]; log.e[k][i] = e[i]; });
    // runners not in the coach group: fill typical level so the programme view stays complete
    R.forEach(function (x) { if (att[x.id][k] == null && !(x.g === 0)) { var a = A(x); var v = a.state === 'disengaged' ? 0 : Math.round(a.base || 2); if (u) v = Math.round(v * .3); att[x.id][k] = v; log.e[k][x.id] = v; } });
    if (k > latest) latest = k;
    if (typeof u === 'boolean') { if (u) notes[k] = { u: true, note: note || 'Unusual week' }; else delete notes[k]; log.n[k] = u ? notes[k] : { u: false }; }
    save(); return { week: k, changes: diff(b, snap()) };
  },
  setNote: function (k, u, note) { var b = snap(); if (u) notes[k] = { u: true, note: note || 'Unusual week' }; else delete notes[k]; log.n[k] = u ? notes[k] : { u: false }; save(); return { changes: diff(b, snap()) }; },
  act: function (id, type) { var a = { id: nx++, id_r: id, type: type, w: latest, st: A(byId[id]).state, undone: false }; acts.push(a); save(); return dec(a); },
  undo: function (id) { acts.forEach(function (a) { if (a.id === id) a.undone = true; }); save(); },
  reset: function () { try { w.localStorage.removeItem(KEY); } catch (e) { } w.location.reload(); }
};

/* ---- UI helpers ---- */
var UI = w.UI = {
  esc: function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); },
  tag: function (s, l) { return '<span class="tag ' + (s === 'not_enough_data' ? 'nodata' : s) + '">' + UI.esc(l) + '</span>'; },
  ago: function (k) { return k == null ? 'No sessions yet' : k === 0 ? 'This week' : k + (k === 1 ? ' week ago' : ' weeks ago'); },
  toast: function (m) { var e = document.getElementById('toast'); if (!e) { e = document.createElement('div'); e.id = 'toast'; document.body.appendChild(e); } e.textContent = m; e.className = 'toast show'; clearTimeout(UI.t); UI.t = setTimeout(function () { e.className = 'toast'; }, 4200); },
  spark: function (h) { return '<span class="sparkbars">' + h.map(function (z) { return '<span class="sb' + (z.a == null ? ' none' : z.a === 0 ? ' zero' : '') + (z.u ? ' unusual' : '') + '" style="height:' + (z.a == null ? 3 : Math.max(2, Math.round(z.a / 4 * 20))) + 'px" title="Week ' + z.w + ': ' + (z.a == null ? 'not logged' : z.a + ' of 4') + '"></span>'; }).join('') + '</span>'; },
  bars: function (rows, fmt) { var pk = Math.max.apply(null, rows.map(function (z) { return z.hidden ? 0 : z.v; }).concat([1e-4])); return '<ul class="hbars">' + rows.map(function (z) { return z.hidden ? '<li><span>' + UI.esc(z.l) + '</span><span class="hb-track"><span class="hb-hidden">Hidden: fewer than ' + MINK + ' runners</span></span><span class="hb-value">–</span></li>' : '<li><span>' + UI.esc(z.l) + '</span><span class="hb-track"><span class="hb-fill" style="width:' + Math.max(1.5, z.v / pk * 100) + '%"></span></span><span class="hb-value">' + UI.esc(fmt(z)) + '</span></li>'; }).join('') + '</ul>'; },
  /* chart: bars=sessions, dashed green=usual, red line=change week, shaded=unusual. line:true plots averages */
  chart: function (ws, o) {
    o = o || {}; var W = 760, H = 220, pl = 34, pt = 18, pb = 34, mx = o.line ? Math.max(3, Math.ceil(Math.max.apply(null, ws.map(function (z) { return z.avg || 0; })))) : 4, n = ws.length, sl = (W - pl - 12) / n,
      y = function (v) { return pt + (H - pt - pb) * (1 - v / mx); }, x = function (i) { return pl + i * sl + sl / 2; }, s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + UI.esc(o.label || 'Attendance by week') + '">';
    for (var g = 0; g <= mx; g++) s += '<line x1="' + pl + '" x2="' + (W - 12) + '" y1="' + y(g) + '" y2="' + y(g) + '" class="grid"/><text x="' + (pl - 8) + '" y="' + (y(g) + 4) + '" class="axis" text-anchor="end">' + g + '</text>';
    var pts = [];
    ws.forEach(function (z, i) {
      var v = o.line ? z.avg : z.a, cx = x(i);
      if (z.u) s += '<rect x="' + (cx - sl / 2) + '" y="' + pt + '" width="' + sl + '" height="' + (H - pt - pb) + '" class="unusual-band"><title>Week ' + z.w + ': ' + UI.esc(z.note || 'unusual') + (o.line ? '' : ', ignored') + '</title></rect>' + (o.line ? '<text x="' + cx + '" y="' + (pt + 11) + '" class="note-label" text-anchor="middle">' + UI.esc(z.note || 'Unusual') + '</text>' : '');
      if (v != null && !o.line) s += '<rect x="' + (cx - Math.min(24, sl * .62) / 2) + '" y="' + (v > 0 ? y(v) : H - pb - 3) + '" width="' + Math.min(24, sl * .62) + '" height="' + (v > 0 ? H - pb - y(v) : 3) + '" rx="3" class="' + (v > 0 ? 'bar' : 'bar-zero') + '"><title>Week ' + z.w + ': ' + v + ' of 4</title></rect>';
      if (v != null && o.line) pts.push(cx + ',' + y(v));
      if (z.w % 2 === 0 || n <= 12) s += '<text x="' + cx + '" y="' + (H - pb + 16) + '" class="axis" text-anchor="middle">' + z.w + '</text>';
    });
    if (o.line) s += '<polyline points="' + pts.join(' ') + '" class="line"/>';
    if (o.base != null) s += '<line x1="' + pl + '" x2="' + (W - 12) + '" y1="' + y(o.base) + '" y2="' + y(o.base) + '" class="baseline"/><text x="' + (W - 12) + '" y="' + (y(o.base) - 5) + '" class="baseline-label" text-anchor="end">usual ' + f1(o.base) + '</text>';
    var ci = o.cw == null ? -1 : ws.findIndex(function (z) { return z.w === o.cw; });
    if (ci >= 0) { var cx2 = x(ci) - sl / 2, end = ci > n * .7; s += '<line x1="' + cx2 + '" x2="' + cx2 + '" y1="' + pt + '" y2="' + (H - pb) + '" class="change"/><text x="' + (end ? cx2 - 6 : cx2 + 6) + '" y="' + (pt + 10) + '" class="change-label" text-anchor="' + (end ? 'end' : 'start') + '">Change detected, week ' + o.cw + '</text>'; }
    return s + '<text x="' + (pl + (W - pl - 12) / 2) + '" y="' + (H - 4) + '" class="axis" text-anchor="middle">Week</text></svg>';
  }
};
w.toggleTheme = function () { var h = document.documentElement, l = h.getAttribute('data-theme') === 'light'; h.setAttribute('data-theme', l ? 'dark' : 'light'); try { w.localStorage.setItem('theme', l ? 'dark' : 'light'); } catch (e) { } };
try { var th = w.localStorage.getItem('theme'); if (th) document.documentElement.setAttribute('data-theme', th); } catch (e) { }
document.addEventListener('DOMContentLoaded', function () {
  var f = document.createElement('footer'); f.className = 'site-footer';
  f.innerHTML = '<span>Synthetic demo data. Runners appear as codes; no names, phone numbers or birth dates are stored. Pattern Coach only suggests. You decide, and it never contacts runners.</span><button type="button" class="linklike" id="rs">Reset demo data</button>';
  document.body.appendChild(f); document.getElementById('rs').onclick = w.HR.reset;
});
})(window);
