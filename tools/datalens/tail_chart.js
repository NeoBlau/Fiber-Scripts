
/* =====================================================================
   Чарт (Advanced): отрисовка Fiber Pulse. Всё тяжёлое посчитано выше на
   сервере; здесь — только разметка из готового результата.
   ===================================================================== */
let RESULT;
try { RESULT = computeApp(); } catch (e) { RESULT = {error: String(e && e.message || e)}; }

function fpRender(options, D) {
    var st = {}; try { st = (typeof Chart !== 'undefined' && Chart.getState && Chart.getState()) || {}; } catch (e) { st = {}; }
    var W = Math.max(320, Math.floor((options && options.width) || 1000)) - 8;
    var C = {up: '#2a78d6', dn: '#e34948', tot: '#8a94a6', warn: '#d08700', fg: 'var(--g-color-text-primary, #1f2328)', mu: 'var(--g-color-text-secondary, #6b7280)', ln: 'var(--g-color-line-generic, #e5e7eb)', bg: 'var(--g-color-base-generic, #f3f5f7)'};
    var PAL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
    function isN(v) { return typeof v === 'number' && isFinite(v); }
    function ns(v, d) { var neg = v < 0, s = Math.abs(v).toFixed(d), p = s.split('.'); return (neg ? '−' : '') + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (p[1] ? ',' + p[1] : ''); }
    function f(v) { if (!isN(v)) return '—'; var a = Math.abs(v); if (a >= 1000) return ns(v, 0); if (a >= 1) return ns(v, 2).replace(/,?0+$/, ''); if (a === 0) return '0'; return ns(v, Math.min(8, 2 - Math.floor(Math.log(a) / Math.LN10))).replace(/,?0+$/, ''); }
    function fc(v) { if (!isN(v)) return '—'; var a = Math.abs(v); if (a >= 1e9) return ns(v / 1e9, a >= 1e10 ? 1 : 2) + ' млрд'; if (a >= 1e6) return ns(v / 1e6, a >= 1e7 ? 1 : 2) + ' млн'; if (a >= 1e4) return ns(v / 1e3, a >= 1e5 ? 0 : 1) + ' тыс.'; return f(v); }
    function fs(v) { return !isN(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + fc(Math.abs(v)); }
    function fp(v) { return !isN(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + ns(Math.abs(v), 1) + '%'; }
    function pc(b, a) { return isN(a) && isN(b) && a !== 0 ? (b - a) / Math.abs(a) * 100 : NaN; }
    function sum(a) { var s = 0, n = 0; for (var i = 0; i < a.length; i++) if (isN(a[i])) { s += a[i]; n++; } return n ? s : NaN; }
    function mean(a) { var s = sum(a), n = 0; for (var i = 0; i < a.length; i++) if (isN(a[i])) n++; return n ? s / n : NaN; }
    function e(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]; }); }
    function col(v) { return v > 0 ? C.up : v < 0 ? C.dn : C.mu; }
    function cut(s, n) { s = String(s); return s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s; }
    function out(h) { return (typeof Editor !== 'undefined' && Editor.generateHtml) ? Editor.generateHtml(h) : h; }
    function btn(id, label, on, dis, tip, sm) {
        return '<button data-id="' + e(id) + '"' + (tip ? ' title="' + e(tip) + '"' : '') + ' style="font:inherit;font-size:' + (sm ? 12 : 13) + 'px;padding:' + (sm ? '3px 8px' : '5px 11px') + ';margin:0 5px 5px 0;border-radius:6px;cursor:' + (dis ? 'default' : 'pointer') + ';border:1px solid ' + (on ? C.up : C.ln) + ';background:' + (on ? C.up : 'transparent') + ';color:' + (on ? '#fff' : dis ? C.mu : C.fg) + ';opacity:' + (dis ? '0.45' : '1') + '">' + label + '</button>';
    }
    function chip(v, st) {
        if (st === 'new') return '<span style="color:' + C.up + ';font-size:12px">новая</span>';
        if (st === 'gone') return '<span style="color:' + C.dn + ';font-size:12px">выбыла</span>';
        if (!isN(v)) return '<span style="color:' + C.mu + '">—</span>';
        return '<span style="display:inline-block;padding:1px 6px;border-radius:10px;font-size:12px;white-space:nowrap;color:' + col(v) + ';background:' + (v > 0 ? 'rgba(42,120,214,.12)' : v < 0 ? 'rgba(227,73,72,.12)' : 'transparent') + '">' + (v > 0 ? '▲ ' : v < 0 ? '▼ ' : '') + fp(v).replace(/^[+−]/, '') + '</span>';
    }
    var wrap = function (h) { return out('<div style="font-family:inherit;font-size:13px;line-height:1.45;color:' + C.fg + ';padding:4px 4px 12px;font-variant-numeric:tabular-nums">' + h + '</div>'); };
    function card(title, sub, body, flex) { return '<div style="flex:' + (flex || '1 1 100%') + ';min-width:0;border:1px solid ' + C.ln + ';border-radius:8px;padding:10px 12px;margin-bottom:10px"><div style="font-weight:600">' + title + '</div>' + (sub ? '<div style="color:' + C.mu + ';font-size:12px;margin-bottom:6px">' + sub + '</div>' : '') + body + '</div>'; }
    function kpi(label, val, sub, c) { return '<div style="flex:1 1 200px;min-width:170px;padding:10px 12px;border:1px solid ' + C.ln + ';border-radius:8px"><div style="color:' + C.mu + ';font-size:12px">' + label + '</div><div style="font-size:20px;font-weight:600;color:' + (c || C.fg) + '">' + val + '</div>' + (sub ? '<div style="color:' + C.mu + ';font-size:12px">' + sub + '</div>' : '') + '</div>'; }
    var ROW = 'style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px"';
    var TBL = '<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;font-size:13px">';
    function th(v, left, id, on) { return '<th' + (id ? ' data-id="' + e(id) + '"' : '') + ' style="text-align:' + (left ? 'left' : 'right') + ';padding:5px 8px;border-bottom:1px solid ' + C.ln + ';color:' + (on ? C.fg : C.mu) + ';font-weight:500;white-space:nowrap' + (id ? ';cursor:pointer' : '') + '">' + v + '</th>'; }
    function td(v, c, b, id) { return '<td' + (id ? ' data-id="' + e(id) + '"' : '') + ' style="text-align:right;padding:5px 8px;border-bottom:1px solid ' + C.ln + ';white-space:nowrap;color:' + (c || C.fg) + (b ? ';font-weight:600' : '') + '">' + v + '</td>'; }
    function tdl(v, id, b, title) { return '<td' + (id ? ' data-id="' + e(id) + '"' : '') + (title ? ' title="' + e(title) + '"' : '') + ' style="text-align:left;padding:5px 8px;border-bottom:1px solid ' + C.ln + ';max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' + (id ? ';cursor:pointer;color:' + C.up : '') + (b ? ';font-weight:600' : '') + '">' + v + '</td>'; }

    /* ---------- графики (SVG) ---------- */
    function lineChart(labels, series, o) {
        o = o || {}; var H = o.h || 260, L = 64, R = 10, T = 12, B = 26, n = labels.length, w = o.w || W;
        var all = []; series.forEach(function (s) { s.v.forEach(function (x) { if (isN(x)) all.push(x); }); if (s.lo) s.lo.forEach(function (x) { if (isN(x)) all.push(x); }); if (s.hi) s.hi.forEach(function (x) { if (isN(x)) all.push(x); }); });
        if (!all.length) return '<div style="color:' + C.mu + ';padding:20px">Нет данных</div>';
        var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all); if (lo > 0 && lo < hi * 0.35) lo = 0; var pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.1 || 1; hi += pad; if (lo !== 0) lo -= pad;
        var x = function (i) { return L + (n <= 1 ? (w - L - R) / 2 : i * (w - L - R) / (n - 1)); }, y = function (v) { return T + (hi - v) / (hi - lo) * (H - T - B); };
        var s = '<svg width="' + w + '" height="' + H + '" viewBox="0 0 ' + w + ' ' + H + '">';
        for (var g = 0; g <= 4; g++) { var gv = lo + (hi - lo) * g / 4, gy = y(gv).toFixed(1); s += '<line x1="' + L + '" x2="' + (w - R) + '" y1="' + gy + '" y2="' + gy + '" stroke="' + C.ln + '"/><text x="' + (L - 6) + '" y="' + (+gy + 4) + '" text-anchor="end" font-size="11" fill="' + C.mu + '">' + e(fc(gv)) + '</text>'; }
        var every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor((w - L - R) / 62))));
        for (var i = 0; i < n; i += every) s += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="' + C.mu + '">' + e(labels[i]) + '</text>';
        if (o.split != null) s += '<line x1="' + x(o.split).toFixed(1) + '" x2="' + x(o.split).toFixed(1) + '" y1="' + T + '" y2="' + (H - B) + '" stroke="' + C.mu + '" stroke-dasharray="3 3"/>';
        if (o.mark != null && o.mark >= 0) s += '<rect x="' + (x(o.mark) - 1).toFixed(1) + '" y="' + T + '" width="2" height="' + (H - T - B) + '" fill="' + C.up + '" opacity="0.25"/>';
        series.forEach(function (sr) {
            if (sr.lo && sr.hi) { var top = '', bot = ''; for (var i = 0; i < n; i++) if (isN(sr.lo[i]) && isN(sr.hi[i])) { top += (top ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(sr.hi[i]).toFixed(1); bot = 'L' + x(i).toFixed(1) + ' ' + y(sr.lo[i]).toFixed(1) + bot; } if (top) s += '<path d="' + top + bot + 'Z" fill="' + sr.c + '" opacity="0.13"/>'; }
            var d = '', pen = false;
            for (var i = 0; i < n; i++) { if (isN(sr.v[i])) { d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(sr.v[i]).toFixed(1); pen = true; } else pen = false; }
            if (sr.area && d) { var first = sr.v.findIndex(isN), last = n - 1; while (last > 0 && !isN(sr.v[last])) last--; s += '<path d="' + d + 'L' + x(last).toFixed(1) + ' ' + y(Math.max(lo, 0)).toFixed(1) + 'L' + x(first).toFixed(1) + ' ' + y(Math.max(lo, 0)).toFixed(1) + 'Z" fill="' + sr.c + '" opacity="0.08"/>'; }
            if (d) s += '<path d="' + d + '" fill="none" stroke="' + sr.c + '" stroke-width="' + (sr.wd || 2) + '"' + (sr.dash ? ' stroke-dasharray="5 4"' : '') + ' stroke-linejoin="round"/>';
        });
        var slot = (w - L - R) / Math.max(1, n - 1);
        for (var i = 0; i < n; i++) {
            var tip = labels[i] + series.map(function (sr) { return isN(sr.v[i]) ? '\n' + sr.name + ': ' + f(sr.v[i]) : ''; }).join('');
            s += '<rect x="' + (x(i) - slot / 2).toFixed(1) + '" y="' + T + '" width="' + Math.max(2, slot).toFixed(1) + '" height="' + (H - T - B) + '" fill="transparent"' + (o.click ? ' data-id="' + e(o.click(i)) + '" style="cursor:pointer"' : '') + '><title>' + e(tip) + '</title></rect>';
        }
        s += '</svg>';
        if (series.length > 1) s += '<div>' + series.map(function (sr) { return '<span style="display:inline-block;margin:0 12px 2px 0;color:' + C.mu + ';font-size:12px"><span style="display:inline-block;width:12px;height:3px;vertical-align:middle;margin-right:5px;background:' + sr.c + '"></span>' + e(sr.name) + '</span>'; }).join('') + '</div>';
        return s;
    }
    function waterfall(items, w) {
        var fit = Math.max(2, Math.min(9, Math.floor(w / 72) - 2)), mid = items.slice(1, -1);
        if (mid.length > fit) { var keep = mid.slice(0, fit - 1), rest = mid.slice(fit - 1), rs = 0, rn = 0; rest.forEach(function (x) { rs += x.v; var mm = /^Прочие \((\d+)\)$/.exec(x.name); rn += mm ? +mm[1] : 1; }); items = [items[0]].concat(keep, [{name: 'Прочие (' + rn + ')', v: rs}], [items[items.length - 1]]); }
        var H = 280, top = 22, bot = 54, n = items.length, run = 0, lo = Infinity, hi = -Infinity, bars = [];
        items.forEach(function (it) { var a, b; if (it.total) { a = 0; b = it.v; run = it.v; } else { a = run; b = run + it.v; run = b; } bars.push({a: a, b: b, it: it}); lo = Math.min(lo, a, b); hi = Math.max(hi, a, b); });
        var tots = items.filter(function (it) { return it.total; }).map(function (it) { return it.v; }), lo2 = Math.min(lo, Math.min.apply(null, tots));
        if (lo2 > 0) lo = Math.max(0, lo2 - (hi - lo2) * 0.6); else lo = lo2; if (hi === lo) hi = lo + 1;
        var y = function (v) { return top + (hi - v) / (hi - lo) * (H - top - bot); }, bw = (w - 16) / n, s = '<svg width="' + w + '" height="' + H + '" viewBox="0 0 ' + w + ' ' + H + '">';
        bars.forEach(function (b, i) {
            var x = 8 + i * bw + bw * 0.15, ww = bw * 0.7, a = b.it.total ? Math.max(lo, 0) : b.a, y1 = y(Math.max(a, b.b)), y2 = y(Math.min(a, b.b)), id = b.it.di != null && b.it.di >= 0 ? ' data-id="pos:' + b.it.di + '" style="cursor:pointer"' : '';
            s += '<rect x="' + x.toFixed(1) + '" y="' + y1.toFixed(1) + '" width="' + ww.toFixed(1) + '" height="' + Math.max(1, y2 - y1).toFixed(1) + '" rx="3" fill="' + (b.it.total ? C.tot : col(b.it.v)) + '"' + id + '><title>' + e(b.it.name) + ': ' + (b.it.total ? f(b.it.v) : (b.it.v > 0 ? '+' : '') + f(b.it.v)) + '</title></rect>';
            s += '<text x="' + (x + ww / 2).toFixed(1) + '" y="' + (y1 - 6).toFixed(1) + '" text-anchor="middle" font-size="11" fill="' + C.fg + '">' + e(b.it.total ? fc(b.it.v) : fs(b.it.v)) + '</text>';
            s += '<text x="' + (x + ww / 2).toFixed(1) + '" y="' + (H - bot + 16) + '" text-anchor="middle" font-size="11" fill="' + C.mu + '">' + e(cut(b.it.name, Math.max(5, Math.floor(bw / 6.5)))) + '<title>' + e(b.it.name) + '</title></text>';
            if (i < n - 1) { var yy = y(b.b).toFixed(1); s += '<line x1="' + (x + ww).toFixed(1) + '" x2="' + (x + bw).toFixed(1) + '" y1="' + yy + '" y2="' + yy + '" stroke="' + C.mu + '" stroke-dasharray="2 2"/>'; }
        });
        return s + '</svg>';
    }
    function hbars(rows, w, fmtv) {
        var rowH = 26, labW = Math.min(240, Math.floor(w * 0.34)), pw = w - labW - 100; fmtv = fmtv || fs;
        var mx = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.v) || 0; }).concat([1e-12])), neg = rows.some(function (r) { return r.v < 0; }), pos = rows.some(function (r) { return r.v > 0; });
        var x0 = labW + (neg && pos ? pw / 2 : neg ? pw : 0), sc = (neg && pos ? pw / 2 : pw) / mx, H = rows.length * rowH + 6;
        var s = '<svg width="' + w + '" height="' + H + '" viewBox="0 0 ' + w + ' ' + H + '"><line x1="' + x0 + '" x2="' + x0 + '" y1="0" y2="' + H + '" stroke="' + C.ln + '"/>';
        rows.forEach(function (r, i) {
            var yy = i * rowH + 3, bw = Math.max(1, Math.abs(r.v || 0) * sc), x = r.v < 0 ? x0 - bw : x0, id = r.id ? ' data-id="' + e(r.id) + '" style="cursor:pointer"' : '';
            s += '<text x="' + (labW - 8) + '" y="' + (yy + 17) + '" text-anchor="end" font-size="12" fill="' + C.fg + '"' + id + '>' + e(cut(r.name, Math.floor(labW / 7.6))) + '<title>' + e(r.name) + (r.tip ? '\n' + r.tip : '') + '</title></text>';
            s += '<rect x="' + x.toFixed(1) + '" y="' + (yy + 4) + '" width="' + bw.toFixed(1) + '" height="16" rx="3" fill="' + col(r.v) + '"' + id + '><title>' + e(r.name) + ': ' + fmtv(r.v) + (r.tip ? '\n' + r.tip : '') + '</title></rect>';
            s += '<text x="' + (w - 4) + '" y="' + (yy + 17) + '" text-anchor="end" font-size="12" fill="' + col(r.v) + '">' + e(fmtv(r.v)) + '</text>';
        });
        return s + '</svg>';
    }
    function stacked(labels, series, w) {
        var H = 260, L = 40, T = 8, B = 24, n = labels.length, iw = w - L - 8, ih = H - T - B, slot = iw / n, bw = Math.max(3, slot - 2);
        var s = '<svg width="' + w + '" height="' + H + '" viewBox="0 0 ' + w + ' ' + H + '">';
        [0, 25, 50, 75, 100].forEach(function (v) { var yy = T + ih - v / 100 * ih; s += '<line x1="' + L + '" x2="' + (w - 8) + '" y1="' + yy + '" y2="' + yy + '" stroke="' + C.ln + '"/><text x="' + (L - 5) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="11" fill="' + C.mu + '">' + v + '%</text>'; });
        var every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(iw / 58))));
        for (var i = 0; i < n; i++) {
            var acc = 0, x0 = L + i * slot + (slot - bw) / 2;
            series.forEach(function (sr) { var v = isN(sr.v[i]) ? Math.max(0, sr.v[i]) : 0; if (v <= 0) return; s += '<rect x="' + x0.toFixed(1) + '" y="' + (T + ih - (acc + v) / 100 * ih + 1).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(0, v / 100 * ih - 1).toFixed(1) + '" fill="' + sr.c + '"><title>' + e(labels[i] + ' · ' + sr.name + ': ' + ns(v, 1) + '%') + '</title></rect>'; acc += v; });
            if (i % every === 0) s += '<text x="' + (L + i * slot + slot / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="' + C.mu + '">' + e(labels[i]) + '</text>';
        }
        return s + '</svg><div>' + series.map(function (sr) { return '<span style="display:inline-block;margin:0 12px 2px 0;color:' + C.mu + ';font-size:12px"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;vertical-align:middle;margin-right:5px;background:' + sr.c + '"></span>' + e(cut(sr.name, 30)) + '</span>'; }).join('') + '</div>';
    }
    function spark(v, w, h) {
        var xs = []; v.forEach(function (x, i) { if (isN(x)) xs.push([i, x]); }); if (xs.length < 2) return '';
        var lo = Math.min.apply(null, xs.map(function (p) { return p[1]; })), hi = Math.max.apply(null, xs.map(function (p) { return p[1]; })); if (hi === lo) hi = lo + 1;
        var d = xs.map(function (p, k) { return (k ? 'L' : 'M') + (2 + p[0] * (w - 4) / Math.max(1, v.length - 1)).toFixed(1) + ' ' + (2 + (hi - p[1]) / (hi - lo) * (h - 4)).toFixed(1); }).join('');
        return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '"><path d="' + d + '" fill="none" stroke="' + C.up + '" stroke-width="1.5"/></svg>';
    }

    if (!D || D.error) return wrap('<div style="padding:16px;border:1px solid ' + C.dn + ';border-radius:8px"><b>Fiber Pulse: ошибка настройки</b><div style="margin-top:6px">' + e(D ? D.error : 'нет данных') + '</div><div style="margin-top:6px;color:' + C.mu + '">Проверьте вкладки Meta (ID датасета) и Params (названия полей).</div></div>');

    /* ---------- шапка ---------- */
    var mi = Math.min(D.metrics.length - 1, Math.max(0, st.m != null ? +st.m : D.metrics.map(function (x) { return x.name; }).indexOf(D.main))), MET = D.metrics[mi], X = D.M[MET.name];
    var tab = st.tab || 'ov', GN = {M: 'месяц', Q: 'квартал', Y: 'год'}[D.grain];
    var TABS = [['ov', 'Обзор'], ['tbl', 'Позиции'], ['heat', 'Карта изменений'], ['det', 'Карточка позиции'], ['fa', 'Факторы'], ['fc', 'Прогноз и сценарии']];
    var h = '<div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px"><div style="font-size:17px;font-weight:600">Fiber Pulse · ' + e(MET.name) + ': ' + e(D.lb) + (D.groupFilter ? ' · ' + e(D.groupFilter) : '') + '</div>' +
        '<div>' + btn('per:-1', '‹', false, D.t <= 0, 'Раньше') + btn('per:+1', '›', false, D.t >= D.periods.length - 1, 'Позже') + btn('cmp:prev', 'к пред. ' + GN + 'у', D.cmp === 'prev') + btn('cmp:yoy', 'к году назад', D.cmp === 'yoy') +
        ['M', 'Q', 'Y'].map(function (g) { return btn('gr:' + g, {M: 'Месяцы', Q: 'Кварталы', Y: 'Годы'}[g], D.grain === g, {M: 0, Q: 1, Y: 2}[g] < {M: 0, Q: 1, Y: 2}[D.base]); }).join('') + '</div></div>';
    h += '<div style="margin-bottom:4px"><span style="color:' + C.mu + ';margin-right:6px">Показатель:</span>' + D.metrics.map(function (x, i) { return btn('m:' + i, e(x.name), i === mi, false, '', true); }).join('') + '</div>';
    if (D.groups.length) h += '<div style="margin-bottom:4px"><span style="color:' + C.mu + ';margin-right:6px">Группа:</span>' + btn('grp:-1', 'Все', !D.groupFilter, false, '', true) + D.groups.slice(0, 15).map(function (g, i) { return btn('grp:' + i, e(g), D.groupFilter === g, false, '', true); }).join('') + (D.groups.length > 15 ? '<span style="color:' + C.mu + '">… ещё ' + (D.groups.length - 15) + ' — через параметр fa_group_filter</span>' : '') + '</div>';
    h += '<div style="border-bottom:1px solid ' + C.ln + ';margin:6px 0 10px">' + TABS.map(function (t) { return btn('tab:' + t[0], t[1], tab === t[0]); }).join('') + '</div>';
    (D.notes || []).forEach(function (n) { h += '<div style="color:' + C.mu + ';margin-bottom:6px">' + e(n) + '</div>'; });
    var avg = MET.agg === 'avg';

    if (tab === 'ov') {
        var sp = X.tot.slice(Math.max(0, D.t - 23), D.t + 1);
        h += '<div ' + ROW + '>' + kpi((avg ? 'Среднее по позициям' : 'Итого') + ' · ' + e(D.lb), fc(X.cur), chip(pc(X.cur, X.base)) + ' ' + fs(X.cur - X.base) + ' к ' + e(D.la) + '<div>' + spark(sp, 220, 34) + '</div>') +
            kpi('К прошлому ' + GN + 'у / к году назад', '<span style="font-size:15px">' + chip(X.prevPct) + ' &nbsp; ' + chip(X.yoyPct) + '</span>', D.full[D.t] ? '' : '⚠ период неполный') +
            kpi('Позиции к ' + e(D.la), '<span style="font-size:15px;color:' + C.up + '">▲ ' + X.nUp + '</span> <span style="font-size:15px;color:' + C.dn + '">▼ ' + X.nDn + '</span>', X.nNew + ' новых · ' + X.nGone + ' выбыло · всего ' + D.nPos) +
            kpi('Лидер роста / сильнее всего упала', '<span style="font-size:14px">' + (X.best ? e(cut(X.best.name, 26)) + ' ' + chip(X.best.pct) : '—') + '<br>' + (X.worst ? e(cut(X.worst.name, 26)) + ' ' + chip(X.worst.pct) : '—') + '</span>') + '</div>';
        var yser = [{name: MET.name, v: X.tot, c: C.up, wd: 2.4, area: true}];
        if (D.grain !== 'Y' && X.tot.length > D.shift) yser.push({name: 'Год назад', v: X.tot.map(function (_, i) { return i - D.shift >= 0 ? X.tot[i - D.shift] : null; }), c: C.tot, dash: true, wd: 1.5});
        var half = W >= 900 ? Math.floor((W - 12) / 2) : W;
        h += '<div style="display:flex;flex-wrap:wrap;gap:10px">' + card('Динамика', 'Наведите на точку — цифры; щёлкните — выбрать период', lineChart(D.labels, yser, {w: half - 26, mark: D.t, click: function (i) { return 'pset:' + i; }}), (W >= 900 ? '1 1 0px' : '1 1 100%')) +
            card('Главное', 'Выводы считаются автоматически', X.ins.map(function (c) { var cc = c.k === 'up' ? C.up : c.k === 'down' ? C.dn : c.k === 'warn' ? C.warn : C.mu; return '<div style="padding:5px 9px;margin-bottom:5px;border-left:3px solid ' + cc + ';background:' + C.bg + ';border-radius:4px">' + c.t + '</div>'; }).join(''), (W >= 900 ? '1 1 0px' : '1 1 100%')) + '</div>';
        h += '<div style="display:flex;flex-wrap:wrap;gap:10px">' + card('Мост: что изменило итог', e(D.la) + ' → ' + e(D.lb) + ', вклад крупнейших позиций. Щёлкните столбик — карточка позиции', X.bridge ? waterfall(X.bridge, half - 26) : '<div style="color:' + C.mu + ';padding:16px">' + (avg ? 'Мост строится для суммируемых показателей.' : 'Нет данных для периода сравнения.') + '</div>', (W >= 900 ? '1 1 0px' : '1 1 100%')) +
            card('Лидеры роста и падения', 'Абсолютное изменение к ' + e(D.la), X.movers.length ? hbars(X.movers.map(function (m) { return {name: m.name, v: m.v, id: m.di >= 0 ? 'pos:' + m.di : '', tip: e(D.la) + ': ' + f(m.a) + '\n' + e(D.lb) + ': ' + f(m.b)}; }), half - 26) : '<div style="color:' + C.mu + '">Нет изменений</div>', (W >= 900 ? '1 1 0px' : '1 1 100%')) + '</div>';
        if (X.struct) { var sl = D.labels.slice(X.struct.from); h += card('Структура: крупнейшие позиции', 'Доли в «' + e(MET.name) + '» по периодам', stacked(sl, X.struct.series.map(function (s, k) { return {name: s.name, v: s.v, c: s.other ? C.tot : PAL[k % 8]}; }), W - 26)); }
    }
    else if (tab === 'tbl') {
        var sc = st.ts || 'cur', dir = st.td || -1, rows = X.table.slice();
        rows.sort(function (a, b) { var x = a[sc], y = b[sc]; if (sc === 'name') return dir * String(x).localeCompare(String(y)); x = isN(x) ? x : -Infinity; y = isN(y) ? y : -Infinity; return dir * (x - y); });
        var cols = [['name', 'Позиция', 1], ['sp', 'Динамика', 0], ['cur', e(D.lb), 0], ['a', e(D.la), 0], ['d', 'Δ', 0], ['dp', 'Δ %', 0], ['mom', 'к пред. ' + GN + 'у', 0], ['yoy', 'к году назад', 0], ['share', 'Доля', 0]];
        h += '<div style="color:' + C.mu + ';margin-bottom:6px">' + e(MET.name) + ' · ' + e(D.lb) + ' против ' + e(D.la) + '. Щёлкните заголовок — сортировка, позицию — карточка.' + (X.tableN > X.table.length ? ' Показаны ' + X.table.length + ' крупнейших из ' + X.tableN + '.' : '') + '</div>';
        h += TBL + '<tr>' + cols.map(function (c) { return th(c[1] + (sc === c[0] ? (dir > 0 ? ' ↑' : ' ↓') : ''), c[2], c[0] === 'sp' ? '' : 'ts:' + c[0], sc === c[0]); }).join('') + '</tr>';
        rows.forEach(function (r) { h += '<tr>' + tdl(e(r.name) + (r.group ? ' <span style="color:' + C.mu + ';font-size:11px">' + e(r.group) + '</span>' : ''), r.di >= 0 ? 'pos:' + r.di : '', false, r.name) + '<td style="border-bottom:1px solid ' + C.ln + ';padding:2px 8px">' + spark(r.sp, 90, 22) + '</td>' + td(f(r.cur)) + td(f(r.a), C.mu) + td(isN(r.cur) || isN(r.a) ? (r.d > 0 ? '+' : '') + f(r.d) : '—', col(r.d)) + td(chip(r.dp, r.st)) + td(chip(r.mom)) + td(chip(r.yoy)) + td(isN(r.share) ? ns(r.share, 1) + '%' : '—', C.mu) + '</tr>'; });
        if (X.tableTot) h += '<tr>' + tdl('Итого (' + X.tableN + ')', '', true) + '<td></td>' + td(f(X.tableTot.cur), null, true) + td(f(X.tableTot.a), null, true) + td(fs(X.tableTot.cur - X.tableTot.a), col(X.tableTot.cur - X.tableTot.a), true) + td(chip(pc(X.tableTot.cur, X.tableTot.a))) + '<td></td><td></td><td></td></tr>';
        h += '</table></div><div style="color:' + C.mu + ';margin-top:6px">Выгрузка в Excel — в чарте-таблице (5_Prepare_Table) или через меню чарта DataLens.</div>';
    }
    else if (tab === 'heat') {
        var mode = st.hm || 'mom', hs = st.hs || 'tot', HT = X.heat, off = HT.from - HT.base, nCols = D.labels.length - HT.from;
        var hv = function (r, j) { var i = off + j, v = r.v; if (mode === 'value') return v[i]; if (mode === 'mom') return i - 1 >= 0 ? pc(v[i], v[i - 1]) : NaN; return i - D.shift >= 0 ? pc(v[i], v[i - D.shift]) : NaN; };
        var hr = HT.rows.slice(); hr.forEach(function (r) { r._last = hv(r, nCols - 1); });
        hr.sort(function (a, b) { return hs === 'name' ? String(a.name).localeCompare(String(b.name)) : hs === 'vol' ? (b.vol || 0) - (a.vol || 0) : hs === 'last' ? (isN(b._last) ? b._last : -1e18) - (isN(a._last) ? a._last : -1e18) : (b.tot || 0) - (a.tot || 0); });
        var allv = []; hr.forEach(function (r) { for (var j = 0; j < nCols; j++) { var v = hv(r, j); if (isN(v)) allv.push(Math.abs(v)); } }); allv.sort(function (a, b) { return a - b; });
        var lim = mode === 'value' ? 1 : Math.max(1, allv[Math.floor(allv.length * 0.9)] || 10);
        h += '<div style="margin-bottom:6px">' + btn('hm:mom', '% к пред. ' + GN + 'у', mode === 'mom', false, '', true) + btn('hm:yoy', '% к году назад', mode === 'yoy', false, '', true) + btn('hm:value', 'Значения', mode === 'value', false, '', true) + '<span style="color:' + C.mu + ';margin:0 6px 0 10px">Сортировка:</span>' + [['tot', 'крупные'], ['last', 'последнее изменение'], ['vol', 'нестабильные'], ['name', 'по алфавиту']].map(function (o) { return btn('hs:' + o[0], o[1], hs === o[0], false, '', true); }).join('') + '</div>';
        h += '<div style="color:' + C.mu + ';margin-bottom:6px;font-size:12px">' + (mode === 'value' ? 'Цвет — величина внутри строки.' : 'Синий — рост, красный — падение; шкала ±' + Math.round(lim) + '%.') + ' Наведите на клетку — подробности, щёлкните позицию — карточка.' + (HT.rows.length < D.nPos ? ' Показаны ' + HT.rows.length + ' из ' + D.nPos + '.' : '') + '</div>';
        h += '<div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:11px"><tr><th></th>' + D.labels.slice(HT.from).map(function (l) { return '<th style="padding:3px 2px;color:' + C.mu + ';font-weight:500;white-space:nowrap;writing-mode:vertical-rl;transform:rotate(180deg)">' + e(l) + '</th>'; }).join('') + '</tr>';
        hr.forEach(function (r) {
            var mx = 1; if (mode === 'value') for (var j = 0; j < nCols; j++) { var q = hv(r, j); if (isN(q)) mx = Math.max(mx, Math.abs(q)); }
            h += '<tr><td' + (r.di >= 0 ? ' data-id="pos:' + r.di + '"' : '') + ' title="' + e(r.name) + '" style="padding:2px 8px 2px 0;white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis;font-size:12px' + (r.di >= 0 ? ';cursor:pointer;color:' + C.up : '') + '">' + e(r.name) + '</td>';
            for (var j = 0; j < nCols; j++) {
                var v = hv(r, j), a = mode === 'value' ? (isN(v) ? 0.08 + 0.8 * Math.abs(v) / mx : 0) : (isN(v) ? Math.min(1, Math.abs(v) / lim) * 0.85 : 0), c = mode === 'value' || v >= 0 ? '42,120,214' : '227,73,72';
                var raw = r.v[off + j];
                h += '<td title="' + e(r.name + ' · ' + D.labels[HT.from + j] + '\nЗначение: ' + f(raw) + (mode !== 'value' ? '\nИзменение: ' + fp(v) : '')) + '" style="min-width:30px;height:22px;text-align:center;border:1px solid ' + C.bg + ';background:' + (isN(v) ? 'rgba(' + c + ',' + a.toFixed(2) + ')' : 'transparent') + ';color:' + (a > 0.55 ? '#fff' : C.mu) + '">' + (isN(v) ? (mode === 'value' ? e(fc(v).replace(' тыс.', 'k').replace(' млн', 'M').replace(' млрд', 'B')) : Math.round(v)) : '') + '</td>';
            }
            h += '</tr>';
        });
        h += '</table></div>';
    }
    else if (tab === 'det') {
        var DL = D.detail, pi = Math.min(DL.length - 1, Math.max(0, +st.pos || 0)), d = DL[pi], v = d.v[MET.name], n = v.length, t = D.t;
        h += '<div style="margin-bottom:8px">' + btn('pos:' + Math.max(0, pi - 1), '‹', false, pi <= 0) + '<b style="font-size:16px">' + e(d.name) + '</b>' + (d.group ? ' <span style="color:' + C.mu + '">· ' + e(d.group) + '</span>' : '') + ' ' + btn('pos:' + Math.min(DL.length - 1, pi + 1), '›', false, pi >= DL.length - 1) + '<span style="color:' + C.mu + '">позиция ' + (pi + 1) + ' из ' + DL.length + ' крупнейших. Другие — через «Позиции» или «Карту изменений».</span></div>';
        var idx = []; v.forEach(function (x, i) { if (isN(x)) idx.push(i); });
        if (!idx.length) h += '<div style="color:' + C.mu + ';padding:16px">По этой позиции нет данных показателя «' + e(MET.name) + '».</div>';
        else {
            var vals = idx.map(function (i) { return v[i]; }), mx2 = Math.max.apply(null, vals), mn2 = Math.min.apply(null, vals), fi = idx[0], li = idx[idx.length - 1];
            var yrs = (li - fi) * {M: 1, Q: 3, Y: 12}[D.grain] / 12, cagr = yrs >= 1 && v[fi] > 0 && v[li] > 0 ? (Math.pow(v[li] / v[fi], 1 / yrs) - 1) * 100 : NaN;
            var chs = []; for (var i = 1; i < n; i++) { var c2 = pc(v[i], v[i - 1]); if (isN(c2)) chs.push(c2); } var mu2 = mean(chs), vol = Math.sqrt(mean(chs.map(function (x) { return (x - mu2) * (x - mu2); })));
            var share = !avg && X.tot[t] ? v[t] / X.tot[t] * 100 : NaN;
            h += '<div ' + ROW + '>' + kpi(e(D.labels[t]), fc(v[t]), chip(pc(v[t], v[t - 1])) + ' к пред. &nbsp;' + chip(t - D.shift >= 0 ? pc(v[t], v[t - D.shift]) : NaN) + ' к году назад') + kpi('Максимум / минимум', fc(mx2) + ' / ' + fc(mn2), e(D.labels[idx[vals.indexOf(mx2)]]) + ' · ' + e(D.labels[idx[vals.indexOf(mn2)]])) +
                kpi('Среднегодовой темп', isN(cagr) ? fp(cagr) : '—', isN(cagr) ? 'с ' + e(D.labels[fi]) + ' по ' + e(D.labels[li]) : 'нужно больше года данных') + kpi('Стабильность', isN(vol) ? '±' + ns(vol, 1) + '%' : '—', 'типичное колебание к пред. ' + GN + 'у' + (isN(share) ? ' · доля ' + ns(share, 1) + '%' : '')) + '</div>';
            var half2 = W >= 900 ? Math.floor((W - 12) / 2) : W;
            var per = D.grain === 'M' ? 12 : 4, years = [];
            D.periods.forEach(function (p) { var y = +p.slice(0, 4); if (years.indexOf(y) < 0) years.push(y); });
            var pidx = function (y, m) { var key = y + '-' + ('0' + (m * (12 / per) + 1)).slice(-2); return D.periods.indexOf(key); };
            var seasonHTML = '';
            if (D.grain !== 'Y') { var ys = years.slice(-6); seasonHTML = lineChart(D.grain === 'M' ? ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'] : ['I кв', 'II кв', 'III кв', 'IV кв'], ys.map(function (y, k) { return {name: String(y), c: k === ys.length - 1 ? C.up : PAL[(k + 1) % 8], wd: k === ys.length - 1 ? 2.6 : 1.5, v: Array.from({length: per}, function (_, m) { var i = pidx(y, m); return i >= 0 ? v[i] : null; })}; }), {w: half2 - 26}); }
            h += '<div style="display:flex;flex-wrap:wrap;gap:10px">' + card('Вся история', '', lineChart(D.labels, [{name: d.name, v: v, c: C.up, wd: 2.4, area: true}], {w: half2 - 26, mark: t, click: function (i) { return 'pset:' + i; }}), (W >= 900 ? '1 1 0px' : '1 1 100%')) +
                (seasonHTML ? card('Год к году', 'Каждая линия — год: видна сезонность', seasonHTML, (W >= 900 ? '1 1 0px' : '1 1 100%')) : '') + '</div>';
            if (D.grain !== 'Y') {
                var cn = D.grain === 'M' ? ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'] : ['I кв', 'II кв', 'III кв', 'IV кв'];
                var tb = TBL + '<tr>' + th('Год', 1) + cn.map(function (m) { return th(m); }).join('') + th(avg ? 'Среднее' : 'За год') + th('к пред. году') + '</tr>';
                years.forEach(function (y) {
                    var row = [], prow = []; for (var m = 0; m < per; m++) { var i1 = pidx(y, m), i0 = pidx(y - 1, m); row.push(i1 >= 0 ? v[i1] : NaN); prow.push(i0 >= 0 ? v[i0] : NaN); }
                    var cmpb = row.map(function (x, m) { return isN(x) && isN(prow[m]); }), yt = avg ? mean(row) : sum(row), ytC = (avg ? mean : sum)(row.filter(function (_, m) { return cmpb[m]; })), pyC = (avg ? mean : sum)(prow.filter(function (_, m) { return cmpb[m]; }));
                    tb += '<tr>' + tdl('<b>' + y + '</b>') + row.map(function (x, m) { var ch = pc(x, prow[m]); return '<td title="' + (isN(ch) ? 'к ' + (y - 1) + ': ' + fp(ch) : '') + '" style="text-align:right;padding:5px 6px;border-bottom:' + (isN(ch) ? '3px solid ' + (ch >= 0 ? C.up : C.dn) : '1px solid ' + C.ln) + ';white-space:nowrap">' + fc(x) + '</td>'; }).join('') + td(fc(yt), null, true) + td(chip(pc(ytC, pyC))) + '</tr>';
                });
                h += card('Таблица по годам', 'Полоска под ячейкой: синяя — выше того же периода прошлого года, красная — ниже', tb + '</table></div>');
            }
            var others = D.metrics.filter(function (x) { return x.name !== MET.name; }).slice(0, 4);
            if (others.length) { var perRow = W >= 900 ? others.length : 1, q4 = Math.floor((W - 10 * (perRow - 1)) / perRow); h += '<div style="display:flex;flex-wrap:wrap;gap:10px">' + others.map(function (o, k) { return card(e(o.name), '', lineChart(D.labels, [{name: o.name, v: d.v[o.name], c: PAL[(k + 1) % 8], wd: 2}], {w: q4 - 26, h: 170, mark: t}), (W >= 900 ? '1 1 0px' : '1 1 100%')); }).join('') + '</div>'; }
        }
    }
    else if (tab === 'fc') {
        var F = X.forecast, Hs = D.grain === 'M' ? [3, 6, 12, 24] : D.grain === 'Q' ? [2, 4, 8] : [1, 3, 5], H = Hs.indexOf(+st.H) >= 0 ? +st.H : Hs[Math.min(2, Hs.length - 1)];
        var fcv = F.fc.slice(0, H), sd = F.sd || 0, lo = fcv.map(function (x, k) { return x - 1.28 * sd * Math.sqrt(1 + k * 0.25); }), hi = fcv.map(function (x, k) { return x + 1.28 * sd * Math.sqrt(1 + k * 0.25); });
        var sAll = +st.sc || 0, sg = st.sg || {}, grpNames = Object.keys(F.groups);
        var scen = avg ? fcv.map(function (x) { return x * (1 + sAll / 100); }) : fcv.map(function (x, i) { var base = x, adj = x * sAll / 100; grpNames.forEach(function (g, gi) { var p2 = +(sg[gi] || 0); if (p2) adj += F.groups[g][i] * p2 / 100; }); return base + adj; });
        var hasSc = sAll !== 0 || Object.keys(sg).some(function (k) { return +sg[k]; });
        var sumH = sum(fcv), sumS = sum(scen), lastH = sum(F.hist.slice(-H)), lf = F.lastFull;
        h += '<div style="margin-bottom:8px"><span style="color:' + C.mu + ';margin-right:6px">Горизонт:</span>' + Hs.map(function (x) { return btn('H:' + x, String(x), x === H, false, '', true); }).join('') + '<span style="color:' + C.mu + '">' + {M: 'мес.', Q: 'кв.', Y: 'г.'}[D.grain] + ' · метод: ' + e(F.method) + '. Это ориентир по прошлой динамике, а не обещание.</span></div>';
        h += '<div ' + ROW + '>' + kpi(avg ? 'Прогноз на конец горизонта' : 'Прогноз за горизонт', fc(avg ? fcv[H - 1] : sumH), avg ? '' : chip(pc(sumH, lastH)) + ' к последним ' + H + ' периодам факта') + kpi('Следующий период · ' + e(F.labels[0]), fc(fcv[0]), '80%: ' + fc(lo[0]) + ' … ' + fc(hi[0])) + kpi('Со сценарием', fc(avg ? scen[H - 1] : sumS), hasSc ? chip(pc(avg ? scen[H - 1] : sumS, avg ? fcv[H - 1] : sumH)) + ' к базовому прогнозу' : 'выберите сценарий справа') + '</div>';
        var lbls = D.labels.slice(0, lf).concat(F.labels.slice(0, H)), pad = new Array(lf - 1).fill(null), lastV = F.hist[lf - 1];
        var ser = [{name: 'Факт', v: F.hist.concat(new Array(H).fill(null)), c: C.up, wd: 2.4}, {name: 'Прогноз', v: pad.concat([lastV], fcv), lo: pad.concat([lastV], lo), hi: pad.concat([lastV], hi), c: PAL[6], dash: true, wd: 2}];
        if (hasSc) ser.push({name: 'Сценарий', v: pad.concat([lastV], scen), c: PAL[1], wd: 2});
        var half3 = W >= 900 ? Math.floor((W - 12) / 2) : W;
        var steps = [-20, -10, -5, 0, 5, 10, 20];
        var scHTML = '<div style="margin-bottom:8px"><div style="margin-bottom:3px">Все позиции: <b>' + fp(sAll) + '</b></div>' + steps.map(function (x) { return btn('sc:' + x, (x > 0 ? '+' : '') + x + '%', x === sAll, false, '', true); }).join('') + '</div>';
        if (!avg) grpNames.slice(0, 10).forEach(function (g, gi) { var cur = +(sg[gi] || 0); scHTML += '<div style="margin-bottom:6px"><div style="margin-bottom:3px">' + e(g) + ': <b>' + fp(cur) + '</b></div>' + steps.map(function (x) { return btn('sg:' + gi + ':' + x, (x > 0 ? '+' : '') + x + '%', x === cur, false, '', true); }).join('') + '</div>'; });
        scHTML += btn('scr:0', 'Сбросить', false, !hasSc, '', true) + '<div style="color:' + C.mu + ';font-size:12px;margin-top:4px">Например: «Все позиции +5%» — общий рост цен; группа −10% — потеря клиента в этой группе.</div>';
        h += '<div style="display:flex;flex-wrap:wrap;gap:10px">' + card('Факт и прогноз', 'Пунктир — прогноз, заливка — интервал ~80%', lineChart(lbls, ser, {w: half3 - 26, h: 290, split: lf - 1}), (W >= 900 ? '1 1 0px' : '1 1 100%')) + card('Сценарий «что если»', 'Изменение относительно прогноза', scHTML, (W >= 900 ? '1 1 0px' : '1 1 100%')) + '</div>';
        var fr = F.rows.map(function (r) { return {r: r, sf: avg ? r.fc[H - 1] : sum(r.fc.slice(0, H)), last: sum(r.last.slice(-H))}; }).sort(function (a, b) { return (b.sf || 0) - (a.sf || 0); });
        h += card('Прогноз по позициям', fr.length >= 50 ? '50 крупнейших позиций' : '', TBL + '<tr>' + th('Позиция', 1) + th(e(F.labels[0])) + th(avg ? 'Конец горизонта' : 'Сумма за ' + H) + (avg ? '' : th('Факт за последние ' + H) + th('Изменение')) + '</tr>' + fr.map(function (x) { return '<tr>' + tdl(e(x.r.name), x.r.di >= 0 ? 'pos:' + x.r.di : '', false, x.r.name) + td(f(x.r.fc[0])) + td(f(x.sf)) + (avg ? '' : td(f(x.last), C.mu) + td(chip(pc(x.sf, x.last)))) + '</tr>'; }).join('') + '</table></div>');
    }
    else if (tab === 'fa') {
        var R = D.fa;
        if (!R || R.error) h += '<div style="padding:16px;border:1px solid ' + C.warn + ';border-radius:8px"><b>Факторный анализ</b><div style="margin-top:6px">' + e(R ? R.error : '') + '</div></div>';
        else if (R.empty) h += '<div style="padding:16px;border:1px dashed ' + C.ln + ';border-radius:8px">' + e(R.empty) + '</div>';
        else {
            var ft = st.ft || 'summary', m = st.fm && R.R[st.fm] ? st.fm : R.method, k = R.vars.length, eff = R.R[m].eff;
            h += '<div style="color:' + C.mu + ';margin-bottom:6px">Модель: <b>' + e(R.resultName) + '</b> = ' + e(R.formula) + ' · ' + e(R.typeName) + '. ' + e(R.la) + ' → ' + e(R.lb) + '. Формула меняется на вкладке Params (fa_formula).</div>';
            h += '<div style="margin-bottom:4px">' + [['summary', 'Итоги'], ['methods', 'Все методы'], ['positions', 'По позициям'], ['detail', 'Расчёт по позиции'], ['order', 'Устойчивость и чувствительность']].map(function (x) { return btn('ft:' + x[0], x[1], ft === x[0], false, '', true); }).join('') + '</div>';
            if (ft !== 'methods' && ft !== 'order') h += '<div style="margin-bottom:8px"><span style="color:' + C.mu + ';margin-right:6px">Метод:</span>' + Object.keys(R.names).map(function (x) { var ok = !!R.R[x]; return btn(ok ? 'fm:' + x : 'na:' + x, R.short[x], x === m, !ok, ok ? R.names[x] : 'Неприменим: ' + (R.na[x] || ''), true); }).join('') + '</div>';
            if (ft === 'summary') {
                h += '<div ' + ROW + '>' + kpi(e(R.la), fc(R.Ya)) + kpi(e(R.lb), fc(R.Yb)) + kpi('Изменение', fs(R.dY), fp(pc(R.Yb, R.Ya)), col(R.dY)) + kpi('Позиций в расчёте', String(R.positionsTotal), (R.newE ? 'новые: ' + fs(R.newE) : '') + (R.goneE ? (R.newE ? ' · ' : '') + 'выбывшие: ' + fs(R.goneE) : '')) + '</div>';
                var it = [{name: R.la, v: R.Ya, total: true}]; R.vars.forEach(function (v2, i) { it.push({name: v2, v: eff[i]}); }); if (R.newE) it.push({name: 'Новые позиции', v: R.newE}); if (R.goneE) it.push({name: 'Выбывшие', v: R.goneE}); it.push({name: R.lb, v: R.Yb, total: true});
                h += card('Водопад: из чего сложилось изменение (' + e(R.names[m]) + ')', '', waterfall(it, W - 26));
                h += card('Выводы', '', (R.conclusions[m] || []).map(function (c) { var cc = c.k === 'up' ? C.up : c.k === 'down' ? C.dn : c.k === 'warn' ? C.warn : C.mu; return '<div style="padding:5px 9px;margin-bottom:5px;border-left:3px solid ' + cc + ';background:' + C.bg + ';border-radius:4px">' + c.t + '</div>'; }).join(''));
            } else if (ft === 'methods') {
                var ms = Object.keys(R.R), tot2 = function (x) { return R.R[x].eff.reduce(function (a, b) { return a + b; }, 0) + R.newE + R.goneE; }, ok2 = function (x) { return Math.abs(tot2(x) - R.dY) <= 1e-6 * Math.max(1, Math.abs(R.dY), Math.abs(R.Ya)); };
                h += TBL + '<tr>' + th('Фактор', 1) + ms.map(function (x) { return th('<span title="' + e(R.names[x]) + '">' + e(R.short[x]) + '</span>'); }).join('') + '</tr>';
                R.vars.forEach(function (v2, i) { h += '<tr>' + tdl(e(v2)) + ms.map(function (x) { return td(fs(R.R[x].eff[i]), col(R.R[x].eff[i])); }).join('') + '</tr>'; });
                if (R.newE) h += '<tr>' + tdl('Новые позиции') + ms.map(function () { return td(fs(R.newE), col(R.newE)); }).join('') + '</tr>';
                if (R.goneE) h += '<tr>' + tdl('Выбывшие позиции') + ms.map(function () { return td(fs(R.goneE), col(R.goneE)); }).join('') + '</tr>';
                h += '<tr>' + tdl('Итого = ΔY', '', true) + ms.map(function (x) { return td(fs(tot2(x)), col(tot2(x)), true); }).join('') + '</tr><tr>' + tdl('Баланс') + ms.map(function (x) { return td(ok2(x) ? '✓ сходится' : '✗ ' + fs(tot2(x) - R.dY), ok2(x) ? C.up : C.dn); }).join('') + '</tr></table></div>';
                var na = Object.keys(R.names).filter(function (x) { return !R.R[x]; });
                if (na.length) h += '<div style="color:' + C.mu + ';margin:6px 0">Неприменимы к этой модели: ' + na.map(function (x) { return e(R.names[x]) + ' — ' + e(R.na[x] || ''); }).join('; ') + '.</div>';
                var all = []; R.vars.forEach(function (_, i) { ms.forEach(function (x) { all.push(R.R[x].eff[i]); }); });
                var lo3 = Math.min(0, Math.min.apply(null, all)), hi3 = Math.max(0, Math.max.apply(null, all)); if (hi3 === lo3) hi3 = lo3 + 1;
                var gH = 220, gw = W - 26, yy = function (v2) { return 14 + (hi3 - v2) / (hi3 - lo3) * (gH - 54); }, gwid = (gw - 10) / k, bwid = gwid * 0.8 / ms.length;
                var sv = '<svg width="' + gw + '" height="' + gH + '" viewBox="0 0 ' + gw + ' ' + gH + '"><line x1="0" x2="' + gw + '" y1="' + yy(0).toFixed(1) + '" y2="' + yy(0).toFixed(1) + '" stroke="' + C.mu + '"/>';
                R.vars.forEach(function (v2, i) { ms.forEach(function (x, q) { var vv = R.R[x].eff[i], xx = 5 + i * gwid + gwid * 0.1 + q * bwid, y1 = yy(Math.max(0, vv)), y2 = yy(Math.min(0, vv)); sv += '<rect x="' + xx.toFixed(1) + '" y="' + y1.toFixed(1) + '" width="' + Math.max(1, bwid - 2).toFixed(1) + '" height="' + Math.max(1, y2 - y1).toFixed(1) + '" rx="2" fill="' + PAL[Object.keys(R.names).indexOf(x)] + '"><title>' + e(v2) + ' · ' + e(R.names[x]) + ': ' + fs(vv) + '</title></rect>'; }); sv += '<text x="' + (5 + i * gwid + gwid / 2).toFixed(1) + '" y="' + (gH - 24) + '" text-anchor="middle" font-size="12" fill="' + C.fg + '">' + e(v2) + '</text>'; });
                h += card('Влияние факторов по методам', '', sv + '</svg><div>' + ms.map(function (x) { return '<span style="display:inline-block;margin:0 12px 4px 0;color:' + C.mu + ';font-size:12px"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;background:' + PAL[Object.keys(R.names).indexOf(x)] + '"></span>' + e(R.short[x]) + '</span>'; }).join('') + '</div>');
            } else if (ft === 'positions') {
                var PP = R.positions;
                h += '<div style="color:' + C.mu + ';margin-bottom:6px">Крупнейшие изменения (показано ' + Math.min(60, PP.length) + ' из ' + R.positionsTotal + '). Щёлкните позицию — подробный расчёт.</div>';
                h += hbars(PP.slice(0, 12).map(function (p, i) { return {name: p.name, v: p.d, id: 'fpos:' + i}; }), W - 8);
                h += TBL + '<tr>' + th('Позиция', 1) + th('Группа', 1) + th(e(R.la)) + th(e(R.lb)) + th('Δ') + th('Δ%') + R.vars.map(function (v2) { return th(e(v2)); }).join('') + '</tr>';
                PP.slice(0, 60).forEach(function (p, i) { var pe = p.per[m] || p.per.shapley || p.per.chain || []; h += '<tr>' + tdl(e(p.name), i < R.detail.length ? 'fpos:' + i : '') + tdl(e(p.group)) + td(fc(p.ya)) + td(fc(p.yb)) + td(fs(p.d), col(p.d), true) + td(fp(pc(p.yb, p.ya)), col(p.d)) + R.vars.map(function (_, j) { return td(fs(pe[j]), col(pe[j])); }).join('') + '</tr>'; });
                h += '</table></div>';
            } else if (ft === 'detail') {
                var DD = R.detail, fi2 = Math.min(DD.length - 1, Math.max(0, +st.fpos || 0)), dd = DD[fi2];
                h += '<div style="margin-bottom:8px">' + btn('fpos:' + Math.max(0, fi2 - 1), '‹', false, fi2 <= 0) + '<b style="font-size:15px">' + e(dd.name) + '</b>' + (dd.group ? ' <span style="color:' + C.mu + '">· ' + e(dd.group) + '</span>' : '') + ' ' + btn('fpos:' + Math.min(DD.length - 1, fi2 + 1), '›', false, fi2 >= DD.length - 1) + '<span style="color:' + C.mu + '">позиция ' + (fi2 + 1) + ' из ' + DD.length + '</span></div>';
                h += TBL + '<tr>' + th('Фактор', 1) + th(e(R.la) + ' (₀)') + th(e(R.lb) + ' (₁)') + th('Δ') + th('Δ%') + '</tr>';
                R.vars.forEach(function (v2, i) { h += '<tr>' + tdl(e(v2)) + td(f(dd.xa[i])) + td(f(dd.xb[i])) + td(fs(dd.xb[i] - dd.xa[i]), col(dd.xb[i] - dd.xa[i])) + td(fp(pc(dd.xb[i], dd.xa[i])), col(dd.xb[i] - dd.xa[i])) + '</tr>'; });
                h += '<tr>' + tdl(e(R.resultName), '', true) + td(f(dd.ya), null, true) + td(f(dd.yb), null, true) + td(fs(dd.d), col(dd.d), true) + td(fp(pc(dd.yb, dd.ya)), col(dd.d), true) + '</tr></table></div>';
                h += '<div style="font-weight:600;margin:12px 0 4px">Цепные подстановки: условные показатели (порядок: ' + e(R.ord.join(' → ')) + ')</div>' + TBL + '<tr>' + th('Расчёт', 1) + th('Значения факторов', 1) + th(e(R.resultName)) + th('Влияние') + '</tr>';
                dd.steps.forEach(function (s2) { h += '<tr>' + tdl(e(s2.label)) + tdl(s2.vals) + td(f(s2.y)) + td(s2.eff == null ? '' : e(s2.f) + ': ' + fs(s2.eff), s2.eff == null ? null : col(s2.eff)) + '</tr>'; });
                h += '</table></div><div style="font-weight:600;margin:12px 0 4px">Формулы метода (' + e(R.names[m]) + ')</div>';
                (dd.lines[m] || (m === 'chain' ? ['см. таблицу условных показателей выше'] : ['нет подробной записи'])).forEach(function (l) { h += '<div style="padding:5px 10px;margin-bottom:4px;background:' + C.bg + ';border-radius:4px;font-family:monospace;font-size:12px;overflow-x:auto">' + l + '</div>'; });
                var pe2 = dd.per[m]; if (pe2) h += '<div style="margin-top:6px;color:' + C.mu + '">Проверка: ' + pe2.map(fs).join(' + ') + ' = ' + fs(pe2.reduce(function (a, b) { return a + b; }, 0)) + ' = Δ ' + fs(dd.d) + ' ✓</div>';
            } else if (ft === 'order') {
                if (R.order) {
                    var O = R.order, mn = Math.min(0, Math.min.apply(null, O.stat.map(function (s2) { return s2.min; }))), mx = Math.max(0, Math.max.apply(null, O.stat.map(function (s2) { return s2.max; }))); if (mx === mn) mx = mn + 1;
                    var labW = Math.min(220, Math.floor(W * 0.3)), pw = W - 8 - labW - 20, Hh = O.stat.length * 34 + 30, xs = function (v2) { return labW + (v2 - mn) / (mx - mn) * pw; };
                    var s3 = '<svg width="' + (W - 8) + '" height="' + Hh + '" viewBox="0 0 ' + (W - 8) + ' ' + Hh + '"><line x1="' + xs(0).toFixed(1) + '" x2="' + xs(0).toFixed(1) + '" y1="0" y2="' + (Hh - 24) + '" stroke="' + C.mu + '" stroke-dasharray="3 3"/>';
                    O.stat.forEach(function (q, i) { var y0 = i * 34 + 6; s3 += '<text x="' + (labW - 8) + '" y="' + (y0 + 15) + '" text-anchor="end" font-size="12" fill="' + C.fg + '">' + e(q.name) + '</text><rect x="' + xs(q.min).toFixed(1) + '" y="' + (y0 + 6) + '" width="' + Math.max(2, xs(q.max) - xs(q.min)).toFixed(1) + '" height="12" rx="3" fill="' + (q.flip ? C.warn : C.tot) + '" opacity="0.55"><title>' + e(q.name) + ': от ' + fs(q.min) + ' до ' + fs(q.max) + '</title></rect><rect x="' + (xs(q.mean) - 1.5).toFixed(1) + '" y="' + (y0 + 2) + '" width="3" height="20" fill="' + C.fg + '"><title>Среднее (= Шепли): ' + fs(q.mean) + '</title></rect><rect x="' + (xs(q.chain) - 4).toFixed(1) + '" y="' + (y0 + 8) + '" width="8" height="8" rx="4" fill="' + C.up + '"><title>Ваш порядок: ' + fs(q.chain) + '</title></rect>'; });
                    s3 += '<text x="' + labW + '" y="' + (Hh - 6) + '" font-size="11" fill="' + C.mu + '">' + fs(mn) + '</text><text x="' + (W - 12) + '" y="' + (Hh - 6) + '" text-anchor="end" font-size="11" fill="' + C.mu + '">' + fs(mx) + '</text></svg>';
                    h += card('Как влияние фактора зависит от порядка подстановки (' + O.n + ' порядков' + (O.sample ? ', по ' + O.sample + ' крупнейшим позициям' : '') + ')', 'Полоса — от минимума до максимума; черта — среднее (= Шепли); синяя точка — ваш порядок; оранжевая полоса — знак влияния меняется', s3);
                } else h += '<div style="color:' + C.mu + '">Устойчивость к порядку считается для 2–6 факторов.</div>';
                h += card('Эластичность: на сколько % изменится результат при росте фактора на 1%', 'от уровня ' + e(R.la), hbars(R.sens.map(function (x) { return {name: x.name, v: x.el}; }), W - 26, function (v2) { return isN(v2) ? (v2 > 0 ? '+' : '') + ns(v2, 2) + '%' : '—'; }));
                h += card('Сценарии: фактор −10% / +10%, остальное без изменений', '', TBL + '<tr>' + th('Фактор', 1) + th('−10%') + th('+10%') + th('Эластичность') + '</tr>' + R.sens.slice().sort(function (a, b) { return (Math.abs(b.hi) + Math.abs(b.lo)) - (Math.abs(a.hi) + Math.abs(a.lo)); }).map(function (x) { return '<tr>' + tdl(e(x.name)) + td(fs(x.lo), col(x.lo)) + td(fs(x.hi), col(x.hi)) + td(isN(x.el) ? ns(x.el, 2) : '—') + '</tr>'; }).join('') + '</table></div>');
            }
        }
    }
    return wrap(h);
}

function fpClick(event, nav) {
    var t = event && event.target, id = null;
    while (t && !id) { id = t.getAttribute ? t.getAttribute('data-id') : null; t = t.parentElement || t.parentNode; }
    if (!id || !nav) return;
    var p = id.split(':'), kind = p[0], v = p[1];
    var st = {}; try { st = Chart.getState() || {}; } catch (e) { st = {}; }
    var set = function (patch) { var n = {}; for (var a in st) n[a] = st[a]; for (var b in patch) n[b] = patch[b]; Chart.setState(n); };
    var upd = function (params) { if (typeof Editor !== 'undefined' && Editor.updateParams) Editor.updateParams(params); else if (Chart.updateParams) Chart.updateParams(params); };
    if (kind === 'tab') set({tab: v});
    else if (kind === 'm') set({m: +v});
    else if (kind === 'pos') set({tab: 'det', pos: +v});
    else if (kind === 'hm') set({hm: v});
    else if (kind === 'hs') set({hs: v});
    else if (kind === 'ts') set({ts: v, td: st.ts === v ? -(st.td || -1) : (v === 'name' ? 1 : -1)});
    else if (kind === 'ft') set({ft: v});
    else if (kind === 'fm') set({fm: v});
    else if (kind === 'fpos') set({ft: 'detail', fpos: +v});
    else if (kind === 'H') set({H: +v});
    else if (kind === 'sc') set({sc: +v});
    else if (kind === 'sg') { var sg = {}; var old = st.sg || {}; for (var a in old) sg[a] = old[a]; sg[v] = +p[2]; set({sg: sg}); }
    else if (kind === 'scr') set({sc: 0, sg: {}});
    else if (kind === 'per') { var i = nav.t + (+v); if (i >= 0 && i < nav.periods.length) upd({fa_period_b: [nav.periods[i]]}); }
    else if (kind === 'pset') { if (nav.periods[+v]) upd({fa_period_b: [nav.periods[+v]]}); }
    else if (kind === 'cmp') upd({fa_compare: [v]});
    else if (kind === 'gr') upd({fa_grain: [v], fa_period_b: ['last']});
    else if (kind === 'grp') upd({fa_group_filter: [+v < 0 ? '' : nav.groups[+v]]});
}

module.exports = {
    render: Editor.wrapFn({fn: fpRender, args: [RESULT]}),
    events: {click: Editor.wrapFn({fn: fpClick, args: [RESULT.error ? null : {t: RESULT.t, periods: RESULT.periods, groups: RESULT.groups}]})},
};
