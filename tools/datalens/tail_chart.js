
/* =====================================================================
   Чарт (Advanced): отрисовка. Тяжёлый расчёт выполнен выше на сервере,
   здесь — только разметка из готового результата.
   ===================================================================== */
let RESULT;
try { RESULT = computeFA(); } catch (e) { RESULT = {error: String(e && e.message || e)}; }

function faRender(options, R) {
    var st = {}; try { st = (typeof Chart !== 'undefined' && Chart.getState && Chart.getState()) || {}; } catch (e) { st = {}; }
    var W = Math.max(320, Math.floor((options && options.width) || 900));
    var C = {up: '#2a78d6', dn: '#e34948', tot: '#8a94a6', fg: 'var(--g-color-text-primary, #1f2328)', mu: 'var(--g-color-text-secondary, #6b7280)', ln: 'var(--g-color-line-generic, #e5e7eb)', bg: 'var(--g-color-base-generic, #f3f5f7)'};
    function isN(v) { return typeof v === 'number' && isFinite(v); }
    function ns(v, d) { var neg = v < 0, s = Math.abs(v).toFixed(d), p = s.split('.'); return (neg ? '−' : '') + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (p[1] ? ',' + p[1] : ''); }
    function f(v) { if (!isN(v)) return '—'; var a = Math.abs(v); if (a >= 1000) return ns(v, 0); if (a >= 1) return ns(v, 2).replace(/,?0+$/, ''); if (a === 0) return '0'; return ns(v, Math.min(8, 2 - Math.floor(Math.log(a) / Math.LN10))).replace(/,?0+$/, ''); }
    function fc(v) { if (!isN(v)) return '—'; var a = Math.abs(v); if (a >= 1e9) return ns(v / 1e9, a >= 1e10 ? 1 : 2) + ' млрд'; if (a >= 1e6) return ns(v / 1e6, a >= 1e7 ? 1 : 2) + ' млн'; if (a >= 1e4) return ns(v / 1e3, a >= 1e5 ? 0 : 1) + ' тыс.'; return f(v); }
    function fs(v) { return !isN(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + fc(Math.abs(v)); }
    function fp(v) { return !isN(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + ns(Math.abs(v), 1) + '%'; }
    function pc(b, a) { return isN(a) && isN(b) && a !== 0 ? (b - a) / Math.abs(a) * 100 : NaN; }
    function e(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]; }); }
    function col(v) { return v > 0 ? C.up : v < 0 ? C.dn : C.mu; }
    function out(h) { return (typeof Editor !== 'undefined' && Editor.generateHtml) ? Editor.generateHtml(h) : h; }
    function btn(id, label, on, dis, tip) {
        return '<button data-id="' + e(id) + '"' + (tip ? ' title="' + e(tip) + '"' : '') + ' style="font:inherit;font-size:13px;padding:5px 11px;margin:0 6px 6px 0;border-radius:6px;cursor:' + (dis ? 'default' : 'pointer') + ';border:1px solid ' + (on ? C.up : C.ln) + ';background:' + (on ? C.up : 'transparent') + ';color:' + (on ? '#fff' : dis ? C.mu : C.fg) + ';opacity:' + (dis ? '0.45' : '1') + '">' + label + '</button>';
    }
    var wrap = function (h) { return out('<div style="font-family:inherit;font-size:13px;line-height:1.45;color:' + C.fg + ';padding:4px 2px;font-variant-numeric:tabular-nums">' + h + '</div>'); };
    if (!R || R.error) return wrap('<div style="padding:16px;border:1px solid ' + C.dn + ';border-radius:8px"><b>Факторный анализ: ошибка настройки</b><div style="margin-top:6px">' + e(R ? R.error : 'нет данных') + '</div><div style="margin-top:6px;color:' + C.mu + '">Проверьте вкладки Meta (ID датасета) и Params (названия полей и формула).</div></div>');

    /* ---------- шапка: период, сравнение, вкладки, методы ---------- */
    var nav = R.nav || {periods: [], labels: [], cur: -1};
    var h = '<div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">' +
        '<div><div style="font-size:17px;font-weight:600">' + e(R.resultName) + ': ' + e(R.la) + ' → ' + e(R.lb) + (R.groupFilter ? ' · ' + e(R.groupFilter) : '') + '</div>' +
        '<div style="color:' + C.mu + '">Модель: ' + e(R.formula) + ' · ' + e(R.typeName) + '</div></div>' +
        '<div>' + btn('per:-1', '‹ раньше', false, nav.cur <= 0) + btn('per:+1', 'позже ›', false, nav.cur >= nav.periods.length - 1) +
        btn('cmp:prev', 'к пред. периоду', nav.cmp === 'prev') + btn('cmp:yoy', 'к прошлому году', nav.cmp === 'yoy') + '</div></div>';
    (R.notes || []).forEach(function (n) { h += '<div style="color:' + C.mu + ';margin-bottom:6px">' + e(n) + '</div>'; });
    if (R.empty) return wrap(h + '<div style="padding:16px;border:1px dashed ' + C.ln + ';border-radius:8px">' + e(R.empty) + '</div>');

    var tab = st.tab || 'summary', m = st.m && R.R[st.m] ? st.m : R.method, k = R.vars.length;
    var TABS = [['summary', 'Итоги'], ['methods', 'Все методы'], ['positions', 'Позиции'], ['detail', 'Расчёт по позиции'], ['order', 'Устойчивость и чувствительность']];
    h += '<div style="border-bottom:1px solid ' + C.ln + ';margin-bottom:10px">' + TABS.map(function (t) { return btn('tab:' + t[0], t[1], tab === t[0]); }).join('') + '</div>';
    if (tab !== 'methods' && tab !== 'order') h += '<div style="margin-bottom:8px"><span style="color:' + C.mu + ';margin-right:6px">Метод:</span>' + Object.keys(R.names).map(function (x) { var ok = !!R.R[x]; return btn(ok ? 'm:' + x : 'na:' + x, R.short[x], x === m, !ok, ok ? R.names[x] : 'Неприменим: ' + (R.na[x] || '')); }).join('') + '</div>';

    var eff = R.R[m].eff;
    /* ---------- водопад ---------- */
    function waterfall(items, w) {
        var H = 260, padL = 8, padR = 8, top = 22, bot = 54, n = items.length, run = 0, lo = Infinity, hi = -Infinity, bars = [];
        items.forEach(function (it) { var a, b; if (it.total) { a = 0; b = it.v; run = it.v; } else { a = run; b = run + it.v; run = b; } bars.push({a: a, b: b, it: it}); lo = Math.min(lo, a, b); hi = Math.max(hi, a, b); });
        var tots = items.filter(function (it) { return it.total; }).map(function (it) { return it.v; });
        var minTot = Math.min.apply(null, tots), lo2 = Math.min(lo, minTot);
        if (lo2 > 0) { var rng = hi - lo2; lo = Math.max(0, lo2 - rng * 0.6); } else lo = lo2;
        if (hi === lo) hi = lo + 1;
        var y = function (v) { return top + (hi - v) / (hi - lo) * (H - top - bot); };
        var bw = (w - padL - padR) / n, s = '<svg width="' + w + '" height="' + H + '" viewBox="0 0 ' + w + ' ' + H + '">';
        bars.forEach(function (b, i) {
            var x = padL + i * bw + bw * 0.15, ww = bw * 0.7, a = b.it.total ? Math.max(lo, 0) : b.a, y1 = y(Math.max(a, b.b)), y2 = y(Math.min(a, b.b)), hh = Math.max(1, y2 - y1);
            var c = b.it.total ? C.tot : col(b.it.v);
            s += '<rect x="' + x.toFixed(1) + '" y="' + y1.toFixed(1) + '" width="' + ww.toFixed(1) + '" height="' + hh.toFixed(1) + '" rx="3" fill="' + c + '"><title>' + e(b.it.name) + ': ' + (b.it.total ? fc(b.it.v) : fs(b.it.v)) + '</title></rect>';
            s += '<text x="' + (x + ww / 2).toFixed(1) + '" y="' + (y1 - 6).toFixed(1) + '" text-anchor="middle" font-size="11" fill="' + C.fg + '">' + e(b.it.total ? fc(b.it.v) : fs(b.it.v)) + '</text>';
            var lab = b.it.name.length > Math.max(6, Math.floor(bw / 6.5)) ? b.it.name.slice(0, Math.max(5, Math.floor(bw / 6.5)) - 1) + '…' : b.it.name;
            s += '<text x="' + (x + ww / 2).toFixed(1) + '" y="' + (H - bot + 16) + '" text-anchor="middle" font-size="11" fill="' + C.mu + '">' + e(lab) + '<title>' + e(b.it.name) + '</title></text>';
            if (i < n - 1) { var yy = y(b.b).toFixed(1); s += '<line x1="' + (x + ww).toFixed(1) + '" x2="' + (x + bw).toFixed(1) + '" y1="' + yy + '" y2="' + yy + '" stroke="' + C.mu + '" stroke-dasharray="2 2"/>'; }
        });
        return s + '</svg>';
    }
    function hbars(rows, w, rowH, fmtv) { // rows: {name, v, id}
        rowH = rowH || 26; fmtv = fmtv || fs; var labW = Math.min(240, Math.floor(w * 0.34)), valW = 90, pw = w - labW - valW - 10;
        var mx = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.v); }).concat([1e-12])), hasNeg = rows.some(function (r) { return r.v < 0; });
        var x0 = labW + (hasNeg ? pw / 2 : 0), sc = (hasNeg ? pw / 2 : pw) / mx, H = rows.length * rowH + 6;
        var s = '<svg width="' + w + '" height="' + H + '" viewBox="0 0 ' + w + ' ' + H + '"><line x1="' + x0 + '" x2="' + x0 + '" y1="0" y2="' + H + '" stroke="' + C.ln + '"/>';
        rows.forEach(function (r, i) {
            var yy = i * rowH + 3, bw = Math.max(1, Math.abs(r.v) * sc), x = r.v < 0 ? x0 - bw : x0, nm = r.name.length > labW / 6.6 ? r.name.slice(0, Math.floor(labW / 6.6) - 1) + '…' : r.name;
            s += '<text x="' + (labW - 8) + '" y="' + (yy + rowH / 2 + 1) + '" text-anchor="end" font-size="12" fill="' + C.fg + '"' + (r.id ? ' data-id="' + e(r.id) + '"' : '') + '>' + e(nm) + '<title>' + e(r.name) + '</title></text>';
            s += '<rect x="' + x.toFixed(1) + '" y="' + (yy + 4) + '" width="' + bw.toFixed(1) + '" height="' + (rowH - 10) + '" rx="3" fill="' + col(r.v) + '"' + (r.id ? ' data-id="' + e(r.id) + '"' : '') + '><title>' + e(r.name) + ': ' + fs(r.v) + '</title></rect>';
            s += '<text x="' + (w - 4) + '" y="' + (yy + rowH / 2 + 1) + '" text-anchor="end" font-size="12" fill="' + col(r.v) + '">' + fmtv(r.v) + '</text>';
        });
        return s + '</svg>';
    }
    function card(label, val, sub, c) { return '<div style="flex:1 1 150px;min-width:140px;padding:10px 12px;border:1px solid ' + C.ln + ';border-radius:8px"><div style="color:' + C.mu + ';font-size:12px">' + label + '</div><div style="font-size:20px;font-weight:600;color:' + (c || C.fg) + '">' + val + '</div>' + (sub ? '<div style="color:' + C.mu + ';font-size:12px">' + sub + '</div>' : '') + '</div>'; }
    var TH = 'style="text-align:right;padding:5px 8px;border-bottom:1px solid ' + C.ln + ';color:' + C.mu + ';font-weight:500;white-space:nowrap"';
    var THL = 'style="text-align:left;padding:5px 8px;border-bottom:1px solid ' + C.ln + ';color:' + C.mu + ';font-weight:500"';
    function td(v, c, b) { return '<td style="text-align:right;padding:5px 8px;border-bottom:1px solid ' + C.ln + ';white-space:nowrap;color:' + (c || C.fg) + (b ? ';font-weight:600' : '') + '">' + v + '</td>'; }
    function tdl(v, id, b) { return '<td' + (id ? ' data-id="' + e(id) + '"' : '') + ' style="text-align:left;padding:5px 8px;border-bottom:1px solid ' + C.ln + (id ? ';cursor:pointer;color:' + C.up : '') + (b ? ';font-weight:600' : '') + '">' + v + '</td>'; }
    var TBL = '<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;font-size:13px">';

    if (tab === 'summary') {
        h += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px">' +
            card(e(R.la), fc(R.Ya)) + card(e(R.lb), fc(R.Yb)) + card('Изменение', fs(R.dY), fp(pc(R.Yb, R.Ya)), col(R.dY)) +
            card('Позиций в расчёте', String(R.positionsTotal), (R.newE ? 'новые: ' + fs(R.newE) : '') + (R.goneE ? (R.newE ? ' · ' : '') + 'выбывшие: ' + fs(R.goneE) : '')) + '</div>';
        var items = [{name: R.la, v: R.Ya, total: true}];
        R.vars.forEach(function (v, i) { items.push({name: v, v: eff[i]}); });
        if (R.newE) items.push({name: 'Новые позиции', v: R.newE}); if (R.goneE) items.push({name: 'Выбывшие', v: R.goneE});
        items.push({name: R.lb, v: R.Yb, total: true});
        h += '<div style="font-weight:600;margin:4px 0">Водопад: из чего сложилось изменение (' + e(R.names[m]) + ')</div>' + waterfall(items, W - 8);
        h += '<div style="font-weight:600;margin:10px 0 4px">Выводы</div>';
        (R.conclusions[m] || []).forEach(function (c) { var cc = c.k === 'up' ? C.up : c.k === 'down' ? C.dn : c.k === 'warn' ? '#d08700' : C.mu; h += '<div style="padding:6px 10px;margin-bottom:5px;border-left:3px solid ' + cc + ';background:' + C.bg + ';border-radius:4px">' + c.t + '</div>'; });
        if (R.R[m].fb) h += '<div style="color:' + C.mu + '">* для ' + R.R[m].fb + ' поз. взят метод Шепли.</div>';
    } else if (tab === 'methods') {
        var ms = Object.keys(R.R);
        h += TBL + '<tr><th ' + THL + '>Фактор</th>' + ms.map(function (x) { return '<th ' + TH + '><span title="' + e(R.names[x]) + '">' + e(R.short[x]) + '</span></th>'; }).join('') + '</tr>';
        R.vars.forEach(function (v, i) { h += '<tr>' + tdl(e(v)) + ms.map(function (x) { return td(fs(R.R[x].eff[i]), col(R.R[x].eff[i])); }).join('') + '</tr>'; });
        if (R.newE) h += '<tr>' + tdl('Новые позиции') + ms.map(function () { return td(fs(R.newE), col(R.newE)); }).join('') + '</tr>';
        if (R.goneE) h += '<tr>' + tdl('Выбывшие позиции') + ms.map(function () { return td(fs(R.goneE), col(R.goneE)); }).join('') + '</tr>';
        h += '<tr>' + tdl('Итого = ΔY', null, true) + ms.map(function (x) { var s = R.R[x].eff.reduce(function (a, b) { return a + b; }, 0) + R.newE + R.goneE; return td(fs(s), col(s), true); }).join('') + '</tr>';
        h += '<tr>' + tdl('Баланс') + ms.map(function (x) { var s = R.R[x].eff.reduce(function (a, b) { return a + b; }, 0) + R.newE + R.goneE; return td(Math.abs(s - R.dY) <= 1e-6 * Math.max(1, Math.abs(R.dY), Math.abs(R.Ya)) ? '✓ сходится' : '✗ ' + fs(s - R.dY), Math.abs(s - R.dY) <= 1e-6 * Math.max(1, Math.abs(R.dY), Math.abs(R.Ya)) ? C.up : C.dn); }).join('') + '</tr></table></div>';
        var na = Object.keys(R.names).filter(function (x) { return !R.R[x]; });
        if (na.length) h += '<div style="color:' + C.mu + ';margin:6px 0">Неприменимы к этой модели: ' + na.map(function (x) { return e(R.names[x]) + ' — ' + e(R.na[x] || ''); }).join('; ') + '.</div>';
        // сгруппированные столбики: фактор × метод
        var gH = 220, gw = W - 8, top = 14, bot = 40, all = [];
        R.vars.forEach(function (v, i) { ms.forEach(function (x) { all.push(R.R[x].eff[i]); }); });
        var lo = Math.min(0, Math.min.apply(null, all)), hi = Math.max(0, Math.max.apply(null, all)); if (hi === lo) hi = lo + 1;
        var yy = function (v) { return top + (hi - v) / (hi - lo) * (gH - top - bot); }, gwid = (gw - 10) / k, bwid = gwid * 0.8 / ms.length;
        var pal = ['#2a78d6', '#e67e22', '#2e9e6a', '#8e5bd6', '#d6455a', '#3aa6b9', '#b38b00', '#6b7280'];
        var s = '<svg width="' + gw + '" height="' + gH + '" viewBox="0 0 ' + gw + ' ' + gH + '"><line x1="0" x2="' + gw + '" y1="' + yy(0).toFixed(1) + '" y2="' + yy(0).toFixed(1) + '" stroke="' + C.mu + '"/>';
        R.vars.forEach(function (v, i) {
            ms.forEach(function (x, q) { var val = R.R[x].eff[i], xx = 5 + i * gwid + gwid * 0.1 + q * bwid, y1 = yy(Math.max(0, val)), y2 = yy(Math.min(0, val)); s += '<rect x="' + xx.toFixed(1) + '" y="' + y1.toFixed(1) + '" width="' + Math.max(1, bwid - 2).toFixed(1) + '" height="' + Math.max(1, y2 - y1).toFixed(1) + '" rx="2" fill="' + pal[Object.keys(R.names).indexOf(x)] + '"><title>' + e(v) + ' · ' + e(R.names[x]) + ': ' + fs(val) + '</title></rect>'; });
            s += '<text x="' + (5 + i * gwid + gwid / 2).toFixed(1) + '" y="' + (gH - bot + 16) + '" text-anchor="middle" font-size="12" fill="' + C.fg + '">' + e(v) + '</text>';
        });
        h += '<div style="font-weight:600;margin:12px 0 4px">Влияние факторов по методам</div>' + s + '</svg><div>' + ms.map(function (x) { return '<span style="display:inline-block;margin:0 12px 4px 0;color:' + C.mu + '"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;background:' + pal[Object.keys(R.names).indexOf(x)] + '"></span>' + e(R.short[x]) + '</span>'; }).join('') + '</div>';
    } else if (tab === 'positions') {
        var P = R.positions;
        h += '<div style="color:' + C.mu + ';margin-bottom:6px">Крупнейшие изменения (показано ' + P.length + ' из ' + R.positionsTotal + '). Нажмите на позицию — откроется подробный расчёт.</div>';
        h += hbars(P.slice(0, 12).map(function (p, i) { return {name: p.name, v: p.d, id: 'pos:' + i}; }), W - 8);
        h += TBL + '<tr><th ' + THL + '>Позиция</th><th ' + THL + '>Группа</th><th ' + TH + '>' + e(R.la) + '</th><th ' + TH + '>' + e(R.lb) + '</th><th ' + TH + '>Δ</th><th ' + TH + '>Δ%</th>' + R.vars.map(function (v) { return '<th ' + TH + '>' + e(v) + '</th>'; }).join('') + '</tr>';
        P.slice(0, 60).forEach(function (p, i) { var pe = p.per[m] || p.per.shapley || p.per.chain || []; h += '<tr>' + tdl(e(p.name), 'pos:' + i) + tdl(e(p.group)) + td(fc(p.ya)) + td(fc(p.yb)) + td(fs(p.d), col(p.d), true) + td(fp(pc(p.yb, p.ya)), col(p.d)) + R.vars.map(function (_, j) { return td(fs(pe[j]), col(pe[j])); }).join('') + '</tr>'; });
        h += '</table></div>';
        if (P.length > 60) h += '<div style="color:' + C.mu + ';margin-top:6px">Полный список с сортировкой и выгрузкой в Excel — в чарте-таблице «5_Prepare_Table».</div>';
    } else if (tab === 'detail') {
        var D = R.detail, pi = Math.min(D.length - 1, Math.max(0, +st.pos || 0)), d = D[pi];
        h += '<div style="margin-bottom:8px">' + btn('pos:' + Math.max(0, pi - 1), '‹', false, pi <= 0) + '<b style="font-size:15px">' + e(d.name) + '</b>' + (d.group ? ' <span style="color:' + C.mu + '">· ' + e(d.group) + '</span>' : '') + ' ' + btn('pos:' + Math.min(D.length - 1, pi + 1), '›', false, pi >= D.length - 1) + '<span style="color:' + C.mu + '"> позиция ' + (pi + 1) + ' из ' + D.length + ' (крупнейшие изменения)</span></div>';
        h += TBL + '<tr><th ' + THL + '>Фактор</th><th ' + TH + '>' + e(R.la) + ' (₀)</th><th ' + TH + '>' + e(R.lb) + ' (₁)</th><th ' + TH + '>Δ</th><th ' + TH + '>Δ%</th></tr>';
        R.vars.forEach(function (v, i) { h += '<tr>' + tdl(e(v)) + td(f(d.xa[i])) + td(f(d.xb[i])) + td(fs(d.xb[i] - d.xa[i]), col(d.xb[i] - d.xa[i])) + td(fp(pc(d.xb[i], d.xa[i])), col(d.xb[i] - d.xa[i])) + '</tr>'; });
        h += '<tr>' + tdl(e(R.resultName), null, true) + td(f(d.ya), null, true) + td(f(d.yb), null, true) + td(fs(d.d), col(d.d), true) + td(fp(pc(d.yb, d.ya)), col(d.d), true) + '</tr></table></div>';
        h += '<div style="font-weight:600;margin:12px 0 4px">Цепные подстановки: условные показатели (порядок: ' + e(R.ord.join(' → ')) + ')</div>';
        h += TBL + '<tr><th ' + THL + '>Расчёт</th><th ' + THL + '>Значения факторов</th><th ' + TH + '>' + e(R.resultName) + '</th><th ' + TH + '>Влияние</th></tr>';
        d.steps.forEach(function (s) { h += '<tr>' + tdl(e(s.label)) + tdl(s.vals) + td(f(s.y)) + td(s.eff == null ? '' : e(s.f) + ': ' + fs(s.eff), s.eff == null ? null : col(s.eff)) + '</tr>'; });
        h += '</table></div>';
        h += '<div style="font-weight:600;margin:12px 0 4px">Формулы методов (' + e(R.names[m]) + ')</div>';
        var lines = d.lines[m] || (m === 'chain' ? ['см. таблицу условных показателей выше'] : ['нет подробной записи']);
        lines.forEach(function (l) { h += '<div style="padding:5px 10px;margin-bottom:4px;background:' + C.bg + ';border-radius:4px;font-family:monospace;font-size:12px;overflow-x:auto">' + l + '</div>'; });
        var pe2 = d.per[m];
        if (pe2) h += '<div style="margin-top:6px;color:' + C.mu + '">Проверка: ' + pe2.map(function (x) { return fs(x); }).join(' + ') + ' = ' + fs(pe2.reduce(function (a, b) { return a + b; }, 0)) + ' = Δ ' + fs(d.d) + ' ✓</div>';
    } else if (tab === 'order') {
        if (R.order) {
            var O = R.order, mn = Math.min(0, Math.min.apply(null, O.stat.map(function (s) { return s.min; }))), mx = Math.max(0, Math.max.apply(null, O.stat.map(function (s) { return s.max; })));
            if (mx === mn) mx = mn + 1;
            var labW = Math.min(220, Math.floor(W * 0.3)), pw = W - 8 - labW - 20, rh = 34, Hh = O.stat.length * rh + 30, xs = function (v) { return labW + (v - mn) / (mx - mn) * pw; };
            var s2 = '<svg width="' + (W - 8) + '" height="' + Hh + '" viewBox="0 0 ' + (W - 8) + ' ' + Hh + '"><line x1="' + xs(0).toFixed(1) + '" x2="' + xs(0).toFixed(1) + '" y1="0" y2="' + (Hh - 24) + '" stroke="' + C.mu + '" stroke-dasharray="3 3"/>';
            O.stat.forEach(function (st2, i) { var y0 = i * rh + 6; s2 += '<text x="' + (labW - 8) + '" y="' + (y0 + 15) + '" text-anchor="end" font-size="12" fill="' + C.fg + '">' + e(st2.name) + '</text>' +
                '<rect x="' + xs(st2.min).toFixed(1) + '" y="' + (y0 + 6) + '" width="' + Math.max(2, xs(st2.max) - xs(st2.min)).toFixed(1) + '" height="12" rx="3" fill="' + (st2.flip ? '#d08700' : C.tot) + '" opacity="0.55"><title>' + e(st2.name) + ': от ' + fs(st2.min) + ' до ' + fs(st2.max) + '</title></rect>' +
                '<rect x="' + (xs(st2.mean) - 1.5).toFixed(1) + '" y="' + (y0 + 2) + '" width="3" height="20" fill="' + C.fg + '"><title>Среднее (= Шепли): ' + fs(st2.mean) + '</title></rect>' +
                '<rect x="' + (xs(st2.chain) - 4).toFixed(1) + '" y="' + (y0 + 8) + '" width="8" height="8" rx="4" fill="' + C.up + '"><title>Ваш порядок: ' + fs(st2.chain) + '</title></rect>'; });
            s2 += '<text x="' + labW + '" y="' + (Hh - 6) + '" font-size="11" fill="' + C.mu + '">' + fs(mn) + '</text><text x="' + (W - 12) + '" y="' + (Hh - 6) + '" text-anchor="end" font-size="11" fill="' + C.mu + '">' + fs(mx) + '</text></svg>';
            h += '<div style="font-weight:600;margin:4px 0">Как влияние фактора зависит от порядка подстановки (' + O.n + ' порядков)</div><div style="color:' + C.mu + ';margin-bottom:4px">Полоса — от минимума до максимума; черта — среднее (= Шепли); синяя точка — ваш порядок. Оранжевая полоса — знак влияния меняется.</div>' + s2;
            h += TBL + '<tr><th ' + THL + '>Фактор</th><th ' + TH + '>Мин.</th><th ' + TH + '>Макс.</th><th ' + TH + '>Среднее</th><th ' + TH + '>Ваш порядок</th></tr>';
            O.stat.forEach(function (x) { h += '<tr>' + tdl(e(x.name) + (x.flip ? ' ⚠' : '')) + td(fs(x.min), col(x.min)) + td(fs(x.max), col(x.max)) + td(fs(x.mean), col(x.mean)) + td(fs(x.chain), col(x.chain)) + '</tr>'; });
            h += '</table></div>';
        } else h += '<div style="color:' + C.mu + '">Устойчивость к порядку считается для 2–6 факторов.</div>';
        h += '<div style="font-weight:600;margin:14px 0 4px">Эластичность: на сколько % изменится результат при росте фактора на 1% (от уровня ' + e(R.la) + ')</div>';
        h += hbars(R.sens.map(function (x) { return {name: x.name, v: x.el}; }), W - 8, 26, function (v) { return isN(v) ? (v > 0 ? '+' : '') + ns(v, 2) + '%' : '—'; });
        h += '<div style="font-weight:600;margin:14px 0 4px">Сценарии: фактор −10% / +10%, остальное без изменений</div>' + TBL + '<tr><th ' + THL + '>Фактор</th><th ' + TH + '>−10%</th><th ' + TH + '>+10%</th><th ' + TH + '>Эластичность</th></tr>';
        R.sens.slice().sort(function (a, b) { return (Math.abs(b.hi) + Math.abs(b.lo)) - (Math.abs(a.hi) + Math.abs(a.lo)); }).forEach(function (x) { h += '<tr>' + tdl(e(x.name)) + td(fs(x.lo), col(x.lo)) + td(fs(x.hi), col(x.hi)) + td(isN(x.el) ? ns(x.el, 2) : '—') + '</tr>'; });
        h += '</table></div>';
    }
    if (R.skipped) h += '<div style="color:' + C.mu + ';margin-top:8px">Пропущено позиций с некорректными значениями: ' + R.skipped + '.</div>';
    return wrap(h);
}

function faClick(event, nav) {
    var t = event && event.target, id = null;
    while (t && !id) { id = t.getAttribute ? t.getAttribute('data-id') : null; t = t.parentElement || t.parentNode; }
    if (!id) return;
    var p = id.split(':'), kind = p[0], v = p.slice(1).join(':');
    var st = {}; try { st = Chart.getState() || {}; } catch (e) { st = {}; }
    var set = function (patch) { var n = {}; for (var a in st) n[a] = st[a]; for (var b in patch) n[b] = patch[b]; Chart.setState(n); };
    var upd = function (params) { if (typeof Editor !== 'undefined' && Editor.updateParams) Editor.updateParams(params); else if (Chart.updateParams) Chart.updateParams(params); };
    if (kind === 'tab') set({tab: v});
    else if (kind === 'm') set({m: v});
    else if (kind === 'pos') set({tab: 'detail', pos: +v});
    else if (kind === 'per' && nav && nav.periods) { var i = nav.cur + (+v); if (i >= 0 && i < nav.periods.length) upd({fa_period_b: [nav.periods[i]]}); }
    else if (kind === 'cmp') upd({fa_compare: [v]});
}

module.exports = {
    render: Editor.wrapFn({fn: faRender, args: [RESULT]}),
    events: {click: Editor.wrapFn({fn: faClick, args: [RESULT.nav || null]})},
};
