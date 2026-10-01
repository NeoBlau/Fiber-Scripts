
/* =====================================================================
   Fiber Pulse целиком: расчёт всех разделов на сервере DataLens.
   Обзор, Позиции, Карта изменений, Карточка позиции, Прогноз
   (+ факторный анализ из computeFA выше).
   ===================================================================== */
const GSTEP = {M: 1, Q: 3, Y: 12}, GORD = {M: 0, Q: 1, Y: 2};
const gKey = (k, g) => g === 'M' ? k : g === 'Q' ? Math.floor(k / 12) * 12 + Math.floor((k % 12) / 3) * 3 : Math.floor(k / 12) * 12;
const sumN = (a) => { let s = 0, n = 0; for (const v of a) if (isNum(v)) { s += v; n++; } return n ? s : NaN; };
const meanN = (a) => { let s = 0, n = 0; for (const v of a) if (isNum(v)) { s += v; n++; } return n ? s / n : NaN; };
const listP = (name) => P(name).split(';').map((s) => s.trim()).filter(Boolean);
const rnd = (v) => isNum(v) ? +v.toPrecision(9) : null;
const rndA = (a) => a.map(rnd);
const rS = (v) => isNum(v) ? +v.toPrecision(6) : null;       // для графиков достаточно 6 знаков
const rSA = (a) => a.map(rS);
const DETAIL_MAX = 80, TABLE_MAX = 150, HEAT_MAX = 120, FC_ROWS = 50;

function forecastSeries(y, h, season) {
    const first = y.findIndex(isNum); if (first < 0) return null;
    if (!isNum(y[y.length - 1])) return null;
    const s = y.slice(first); const n = s.length;
    if (n < 4) return null;
    for (let i = 1; i < n; i++) if (!isNum(s[i])) s[i] = s[i - 1];
    const lin = (arr) => { const m = arr.length, mx = (m - 1) / 2, my = meanN(arr); let sxy = 0, sxx = 0; arr.forEach((v, i) => { sxy += (i - mx) * (v - my); sxx += (i - mx) * (i - mx); }); const b = sxx ? sxy / sxx : 0; return {a: my - b * mx, b}; };
    let fit = [], fc = [], method;
    if (season > 1 && n >= 2 * season) {
        method = 'сезонность + тренд';
        const tr = lin(s); const mult = s.every((v) => v > 0) && tr.a > 0 && tr.a + tr.b * (n - 1) > 0;
        const idx = new Array(season).fill(0).map(() => []);
        s.forEach((v, i) => { const t = tr.a + tr.b * i; idx[i % season].push(mult ? v / t : v - t); });
        let si = idx.map(meanN); const norm = meanN(si); si = si.map((v) => mult ? v / norm : v - norm);
        const des = s.map((v, i) => mult ? v / si[i % season] : v - si[i % season]);
        const w = Math.min(n, season * 3); const tr2 = lin(des.slice(n - w)); const off = n - w;
        const val = (i) => { const t = tr2.a + tr2.b * (i - off); return mult ? t * si[i % season] : t + si[i % season]; };
        fit = s.map((_, i) => val(i)); for (let i = n; i < n + h; i++) fc.push(val(i));
    } else {
        method = 'тренд (Холт)';
        const al = 0.5, be = 0.2, ph = 0.9; let lv = s[0], tr = s[1] - s[0];
        fit.push(s[0]);
        for (let i = 1; i < n; i++) { fit.push(lv + ph * tr); const nl = al * s[i] + (1 - al) * (lv + ph * tr); tr = be * (nl - lv) + (1 - be) * ph * tr; lv = nl; }
        let damp = 0; for (let k = 1; k <= h; k++) { damp += Math.pow(ph, k); fc.push(lv + damp * tr); }
    }
    const res = s.map((v, i) => v - fit[i]).slice(season > 1 ? Math.min(season, Math.floor(n / 3)) : 1);
    const sd = Math.sqrt(meanN(res.map((r) => r * r))) || 0;
    return {fc, method, sd};
}

function computeApp() {
    const fPeriod = P('fa_period'), fPos = P('fa_position'), fGroup = P('fa_group');
    if (!fPeriod) throw new Error('Не задано поле периода (параметр fa_period на вкладке Params).');
    const formula = P('fa_formula');
    const fvars = []; formula.replace(/\[([^\]]+)\]/g, (_, n) => { n = n.trim(); if (!fvars.includes(n)) fvars.push(n); return ''; });
    let metrics = listP('fa_metrics'); if (!metrics.length) metrics = fvars.slice();
    metrics = metrics.filter((m, i, a) => a.indexOf(m) === i).slice(0, 8);
    if (!metrics.length) throw new Error('Не заданы показатели: впишите числовые поля в параметр fa_metrics на вкладке Params.');
    const columns = [fPeriod, fPos, fGroup].concat(metrics, fvars).filter((c, i, a) => c && a.indexOf(c) === i);
    const rows = loadRows(columns);
    if (!rows.length) throw new Error('Датасет вернул 0 строк. Проверьте ID датасета на вкладке Meta.');
    const missing = columns.filter((c) => !(c in rows[0]));
    if (missing.length) throw new Error('В датасете нет полей: ' + missing.join(', ') + '. Есть: ' + Object.keys(rows[0]).join(', '));
    const avgList = listP('fa_avg_fields');
    const isAvg = (m) => avgList.length ? avgList.includes(m) : guessAvg(m);

    /* ---- периоды и шаг ---- */
    let gMin = 2; const bad = [];
    const parsed = rows.map((r) => { const p = parsePeriod(r[fPeriod]); if (p) gMin = Math.min(gMin, GORD[p.g]); else if (bad.length < 3) bad.push(String(r[fPeriod])); return p; });
    if (!parsed.some(Boolean)) throw new Error('Не удалось распознать периоды в поле «' + fPeriod + '»' + (bad.length ? ' (например: ' + bad.join(', ') + ')' : '') + '. Нужны даты или месяцы.');
    const base = ['M', 'Q', 'Y'][gMin];
    const G = ['M', 'Q', 'Y'][Math.max(gMin, GORD[P('fa_grain')] || 0)];

    /* ---- позиции и группы ---- */
    const grpFilter = P('fa_group_filter');
    const posMap = new Map(), keySet = new Set(), baseSeen = new Map(), recs = [];
    rows.forEach((r, i) => {
        const p = parsed[i]; if (!p) return;
        const pos = fPos ? String(r[fPos] == null ? '—' : r[fPos]) : 'Итого';
        const grp = fGroup ? String(r[fGroup] == null ? '' : r[fGroup]) : '';
        if (!posMap.has(pos)) posMap.set(pos, {name: pos, group: grp}); else if (grp && !posMap.get(pos).group) posMap.get(pos).group = grp;
        const k = gKey(p.key, G); keySet.add(k);
        if (!baseSeen.has(k)) baseSeen.set(k, new Set()); baseSeen.get(k).add(gKey(p.key, base));
        recs.push([pos, k, r]);
    });
    const allGroups = Array.from(new Set(Array.from(posMap.values()).map((p) => p.group).filter(Boolean))).sort();
    const positions = Array.from(posMap.values()).filter((p) => !grpFilter || p.group === grpFilter);
    if (!positions.length) throw new Error('В группе «' + grpFilter + '» нет позиций. Нажмите «Все группы».');
    const pIndex = new Map(positions.map((p, i) => [p.name, i]));
    const ks = Array.from(keySet).sort((a, b) => a - b);
    const keys = []; for (let k = ks[0]; k <= ks[ks.length - 1]; k += GSTEP[G]) keys.push(k);
    const kIndex = new Map(keys.map((k, i) => [k, i]));
    const nP = positions.length, nK = keys.length;
    const per = Math.round(GSTEP[G] / GSTEP[base]);
    const full = keys.map((k) => (baseSeen.has(k) ? baseSeen.get(k).size : 0) >= per);
    const labels = keys.map((k) => pLabel(k, G));

    /* ---- значения: показатель → [позиция × период] ---- */
    const V = {}, metaM = [], SS = metrics.map(() => new Array(nP * nK).fill(0)), CC = metrics.map(() => new Array(nP * nK).fill(0)), nM = metrics.length;
    recs.forEach((x) => {
        const pi = pIndex.get(x[0]); if (pi == null) return; const j = pi * nK + kIndex.get(x[1]), r = x[2];
        for (let q = 0; q < nM; q++) { const v = parseNum(r[metrics[q]]); if (isNum(v)) { SS[q][j] += v; CC[q][j]++; } }
    });
    metrics.forEach((m, q) => { const avg = isAvg(m), s = SS[q], c = CC[q]; V[m] = s.map((x, j) => c[j] ? (avg ? x / c[j] : x) : NaN); metaM.push({name: m, agg: avg ? 'avg' : 'sum'}); });
    let main = P('fa_metric'); if (!metrics.includes(main)) main = metrics.find((n) => /выручк|продаж|revenue|sales|затрат|расход|сумм|оборот|доход/i.test(n)) || metrics[0];

    /* ---- выбранный период и база сравнения ---- */
    const notes = [];
    const pb = P('fa_period_b'), cmp = P('fa_compare') || 'yoy';
    let t = nK - 1;
    if (pb && pb !== 'last') { const p = parsePeriod(pb); const i = p ? kIndex.get(gKey(p.key, G)) : undefined; if (i != null) t = i; else notes.push('Период «' + pb + '» не найден — взят последний.'); }
    let ta = -1;
    if (cmp === 'prev') ta = t - 1;
    else if (cmp === 'custom') { const p = parsePeriod(P('fa_period_a')); const i = p ? kIndex.get(gKey(p.key, G)) : undefined; ta = i == null ? -1 : i; if (ta < 0) notes.push('Базисный период fa_period_a не найден.'); }
    else { const i = kIndex.get(keys[t] - 12); ta = i == null ? -1 : i; }
    const la = ta >= 0 ? labels[ta] : (cmp === 'yoy' ? pLabel(keys[t] - 12, G) : '—'), lb = labels[t];
    const shift = G === 'M' ? 12 : G === 'Q' ? 4 : 1, season = shift;
    const yoyI = (i) => { const j = kIndex.get(keys[i] - 12); return j == null ? -1 : j; };

    /* ---- карточки позиций: крупнейшие по основному показателю ---- */
    const mv0 = V[main], val0 = (p, i) => mv0[p * nK + i];
    const rank = positions.map((_, p) => { let v = val0(p, t); if (!isNum(v)) v = sumN(keys.map((_, i) => val0(p, i))) / nK; return {p, v: isNum(v) ? Math.abs(v) : -1}; }).sort((a, b) => b.v - a.v);
    const dList = rank.slice(0, DETAIL_MAX).map((x) => x.p), dIdx = new Map(dList.map((p, i) => [p, i]));
    const detail = dList.map((p) => ({name: positions[p].name, group: positions[p].group, v: metrics.reduce((o, m) => { o[m] = rSA(V[m].slice(p * nK, p * nK + nK)); return o; }, {})}));
    const di = (p) => dIdx.has(p) ? dIdx.get(p) : -1;

    /* ---- расчёт по каждому показателю ---- */
    const lastFull = full[nK - 1] ? nK : nK - 1;
    const Hmax = G === 'M' ? 24 : G === 'Q' ? 8 : 5;
    const M = {};
    metaM.forEach((mm) => {
        const m = mm.name, v = V[m], agg = mm.agg, red = agg === 'avg' ? meanN : sumN;
        const val = (p, i) => i >= 0 && i < nK ? v[p * nK + i] : NaN;
        const col = (i) => Array.from({length: nP}, (_, p) => val(p, i));
        const tot = keys.map((_, i) => red(col(i)));
        const b = col(t), a = ta >= 0 ? col(ta) : null;
        const curTot = red(b), baseTot = a ? red(a) : NaN;
        // движение позиций
        const mv = [];
        for (let p = 0; p < nP; p++) {
            const x = a ? a[p] : NaN, y = b[p]; if (!isNum(x) && !isNum(y)) continue;
            const st = !isNum(x) ? 'new' : !isNum(y) ? 'gone' : 'both';
            mv.push({p, name: positions[p].name, a: x, b: y, d: (isNum(y) ? y : 0) - (isNum(x) ? x : 0), pct: st === 'both' ? pct(y, x) : NaN, st});
        }
        const both = mv.filter((x) => x.st === 'both');
        const up = both.filter((x) => x.d > 0).sort((p, q) => q.d - p.d), dn = both.filter((x) => x.d < 0).sort((p, q) => p.d - q.d);
        const pk = (x) => x ? {name: x.name, di: di(x.p), d: rnd(x.d), pct: rnd(x.pct)} : null;
        // мост
        let bridge = null;
        if (a && agg === 'sum') {
            const ranked = mv.slice().sort((p, q) => Math.abs(q.d) - Math.abs(p.d)), top = ranked.slice(0, 7), rest = ranked.slice(7);
            bridge = [{name: la, v: rnd(sumN(a) || 0), total: true}].concat(top.map((x) => ({name: x.name, v: rnd(x.d), di: di(x.p)})), rest.length ? [{name: 'Прочие (' + rest.length + ')', v: rnd(rest.reduce((s, x) => s + x.d, 0))}] : [], [{name: lb, v: rnd(curTot), total: true}]);
        }
        const ranked2 = mv.filter((x) => isNum(x.d) && x.d !== 0).sort((p, q) => q.d - p.d);
        const shown = ranked2.length > 12 ? ranked2.slice(0, 6).concat(ranked2.slice(-6)) : ranked2;
        // выводы
        const ins = [];
        if (isNum(baseTot)) { const pc = pct(curTot, baseTot); ins.push({k: pc >= 0 ? 'up' : 'down', t: (agg === 'avg' ? 'Среднее' : 'Итого') + ' за <b>' + esc(lb) + '</b>: ' + fmtC(curTot) + ' — ' + (pc >= 0 ? 'рост' : 'снижение') + ' на <b>' + fmtP(pc) + '</b> (' + fmtS(curTot - baseTot) + ') к ' + esc(la) + '.'}); }
        else ins.push({k: 'info', t: 'Для «' + esc(la) + '» нет данных — сравнивать не с чем. Выберите другой режим сравнения.'});
        if (up.length) ins.push({k: 'up', t: 'Больше всего прибавили: ' + up.slice(0, 3).map((x) => '<b>' + esc(x.name) + '</b> (' + fmtS(x.d) + ', ' + fmtP(x.pct) + ')').join(', ') + '.'});
        if (dn.length) ins.push({k: 'down', t: 'Сильнее всего просели: ' + dn.slice(0, 3).map((x) => '<b>' + esc(x.name) + '</b> (' + fmtS(x.d) + ', ' + fmtP(x.pct) + ')').join(', ') + '.'});
        if (isNum(baseTot) && agg === 'sum' && curTot !== baseTot) {
            const dT = curTot - baseTot, srt = mv.slice().sort((p, q) => Math.sign(dT) * (q.d - p.d)); let acc = 0, k = 0;
            for (const x of srt) { acc += x.d; k++; if (Math.abs(acc) >= Math.abs(dT) * 0.8 || k >= srt.length) break; }
            if (k <= Math.max(3, mv.length * 0.3) && mv.length > 4) ins.push({k: 'info', t: 'Изменение сконцентрировано: <b>' + k + '</b> из ' + mv.length + ' позиций дают 80% итогового ' + (dT > 0 ? 'прироста' : 'снижения') + '.'});
        }
        const nw = mv.filter((x) => x.st === 'new'), gone = mv.filter((x) => x.st === 'gone');
        if (nw.length) ins.push({k: 'info', t: 'Новые позиции (не было в «' + esc(la) + '»): ' + nw.slice(0, 4).map((x) => '<b>' + esc(x.name) + '</b>').join(', ') + (nw.length > 4 ? ' и ещё ' + (nw.length - 4) : '') + '.'});
        if (gone.length) ins.push({k: 'warn', t: 'Выбыли (нет данных в «' + esc(lb) + '»): ' + gone.slice(0, 4).map((x) => '<b>' + esc(x.name) + '</b>').join(', ') + (gone.length > 4 ? ' и ещё ' + (gone.length - 4) : '') + '.'});
        if (G !== 'Y') {
            const an = [];
            for (let p = 0; p < nP; p++) {
                const ch = []; for (let i = 1; i <= t; i++) { const c = pct(val(p, i), val(p, i - 1)); if (isNum(c)) ch.push(c); }
                if (ch.length < 8) continue; const last = ch[ch.length - 1], hist = ch.slice(0, -1), mu = meanN(hist), sd = Math.sqrt(meanN(hist.map((x) => (x - mu) * (x - mu))));
                const z = sd > 0 ? (last - mu) / sd : NaN; if (isNum(z) && Math.abs(z) >= 2.5) an.push({p, z});
            }
            an.sort((p, q) => Math.abs(q.z) - Math.abs(p.z));
            if (an.length) ins.push({k: 'warn', t: 'Необычное изменение к прошлому периоду: ' + an.slice(0, 3).map((x) => '<b>' + esc(positions[x.p].name) + '</b> (' + (x.z > 0 ? 'выше' : 'ниже') + ' нормы в ' + numStr(Math.abs(x.z), 1) + ' раза по разбросу)').join(', ') + '. Проверьте данные или причину.'});
        }
        if (!full[t] || (ta >= 0 && !full[ta])) ins.push({k: 'warn', t: 'В сравнении участвует неполный период — данные есть не за все месяцы.'});
        // структура: доли крупнейших позиций
        let struct = null;
        if (agg === 'sum') {
            const from = Math.max(0, nK - (G === 'M' ? 24 : G === 'Q' ? 12 : 10));
            const top = Array.from({length: nP}, (_, p) => ({p, v: val(p, t)})).filter((x) => isNum(x.v)).sort((p, q) => q.v - p.v).slice(0, 7).map((x) => x.p);
            const series = top.map((p) => ({name: positions[p].name, v: keys.slice(from).map((_, j) => { const x = val(p, from + j), tt = tot[from + j]; return isNum(x) && tt ? rnd(x / tt * 100) : null; })}));
            if (nP > top.length) series.push({name: 'Прочие', other: true, v: keys.slice(from).map((_, j) => { const tt = tot[from + j], s = sumN(top.map((p) => val(p, from + j))); return tt ? rnd((tt - (isNum(s) ? s : 0)) / tt * 100) : null; })});
            struct = {from, series};
        }
        // таблица позиций
        const totB = sumN(b);
        const tbl = Array.from({length: nP}, (_, p) => p).filter((p) => isNum(b[p]) || (a && isNum(a[p]))).map((p) => {
            const cur = b[p], x = a ? a[p] : NaN, yi = yoyI(t);
            return {name: positions[p].name, group: positions[p].group, di: di(p), cur: rnd(cur), a: rnd(x), d: rnd((isNum(cur) ? cur : 0) - (isNum(x) ? x : 0)), dp: rS(pct(cur, x)),
                st: !isNum(x) && isNum(cur) ? 'new' : isNum(x) && !isNum(cur) ? 'gone' : '', mom: rS(pct(cur, val(p, t - 1))), yoy: rS(yi >= 0 ? pct(cur, val(p, yi)) : NaN),
                share: rS(agg === 'sum' && totB ? (isNum(cur) ? cur : 0) / totB * 100 : NaN), sp: rSA(keys.map((_, i) => val(p, i)).slice(Math.max(0, t - (G === 'M' ? 12 : G === 'Q' ? 8 : 5)), t + 1))};
        }).sort((p, q) => Math.abs(q.cur || 0) - Math.abs(p.cur || 0));
        const tblTot = agg === 'sum' ? {cur: rnd(sumN(tbl.map((r) => r.cur))), a: rnd(sumN(tbl.map((r) => r.a)))} : null;
        // карта изменений
        const hFrom = Math.max(0, nK - 36), hBase = Math.max(0, hFrom - shift);
        const hTop = Array.from({length: nP}, (_, p) => { let s0 = 0; for (let i = hFrom; i < nK; i++) { const x = v[p * nK + i]; if (isNum(x)) s0 += x; } return {p, tot: s0}; }).sort((p, q) => q.tot - p.tot).slice(0, HEAT_MAX);
        const heat = {from: hFrom, base: hBase, rows: hTop.map((h0) => {
            const p = h0.p, vs = v.slice(p * nK + hBase, p * nK + nK), ch = []; for (let i = hFrom - hBase + 1; i < vs.length; i++) { const c = pct(vs[i], vs[i - 1]); if (isNum(c)) ch.push(c); }
            const mu = meanN(ch); return {name: positions[p].name, di: di(p), tot: rnd(h0.tot), vol: rS(Math.sqrt(meanN(ch.map((x) => (x - mu) * (x - mu))))), v: rSA(vs)};
        })};
        // прогноз
        // прогноз итога и групп — по их рядам; по позициям — для 100 крупнейших
        const histTot = tot.slice(0, lastFull);
        const tf = forecastSeries(histTot, Hmax, season);
        const fc = tf ? tf.fc : [];
        const byGroup = {};
        if (agg === 'sum') allGroups.forEach((g) => {
            const ps = []; for (let p = 0; p < nP; p++) if (positions[p].group === g) ps.push(p); if (!ps.length) return;
            const gs = keys.slice(0, lastFull).map((_, i) => sumN(ps.map((p) => val(p, i)))), gf = forecastSeries(gs, Hmax, season);
            if (gf) byGroup[g] = rndA(gf.fc);
        });
        const lastKey = keys[lastFull - 1];
        const big = Array.from({length: nP}, (_, p) => ({p, s: sumN(keys.slice(Math.max(0, lastFull - 12), lastFull).map((_, j) => val(p, Math.max(0, lastFull - 12) + j)))})).filter((x) => isNum(x.s)).sort((p, q) => Math.abs(q.s) - Math.abs(p.s)).slice(0, FC_ROWS);
        const fcRows = big.map((x) => ({p: x.p, f: forecastSeries(keys.slice(0, lastFull).map((_, i) => val(x.p, i)), Hmax, season)})).filter((x) => x.f)
            .map((x) => ({name: positions[x.p].name, di: di(x.p), fc: rSA(x.f.fc), last: rSA(keys.slice(0, lastFull).map((_, i) => val(x.p, i)).slice(-Hmax))}));
        const forecast = {lastFull, hist: rndA(histTot), fc: rndA(fc), sd: rnd(tf ? tf.sd : 0), method: tf ? tf.method : '—', groups: byGroup, rows: fcRows,
            labels: Array.from({length: Hmax}, (_, i) => pLabel(lastKey + (i + 1) * GSTEP[G], G))};
        M[m] = {agg, tot: rndA(tot), cur: rnd(curTot), base: rnd(baseTot), prevPct: rnd(pct(curTot, tot[t - 1])), yoyPct: rnd(yoyI(t) >= 0 ? pct(curTot, tot[yoyI(t)]) : NaN),
            nUp: up.length, nDn: dn.length, nNew: nw.length, nGone: gone.length, best: pk(up[0]), worst: pk(dn[0]), bridge,
            movers: shown.map((x) => ({name: x.name, di: di(x.p), v: rnd(x.d), a: rnd(x.a), b: rnd(x.b), pct: rnd(x.pct), st: x.st})), ins, struct,
            table: tbl.slice(0, TABLE_MAX), tableN: tbl.length, tableTot: tblTot, heat, forecast};
    });

    /* ---- факторный анализ ---- */
    let fa;
    if (!formula) fa = {error: 'Формула не задана (параметр fa_formula на вкладке Params), например [Продано, шт.] * [Цена, руб.].'};
    else { try { fa = computeFA({rows, lite: true}); } catch (e) { fa = {error: String(e && e.message || e)}; } }

    return {
        metrics: metaM, main, groups: allGroups, groupFilter: grpFilter, grain: G, base, cmp, t, ta, la, lb, labels, full, notes,
        periods: keys.map(pIso), nPos: nP, detail, M, fa, shift,
    };
}
