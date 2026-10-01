// Вставьте этот файл целиком во вкладку Prepare. Настройки — во вкладке Params.
// =====================================================================
//  Fiber Pulse · Детерминированный факторный анализ для Yandex DataLens
//  Ядро расчёта (выполняется на сервере DataLens во вкладке Prepare).
//  Менять ничего не нужно: все настройки — на вкладке Params.
// =====================================================================
const Dataset = require('libs/dataset/v2');

/* ---------------------------- утилиты ---------------------------- */
const isNum = (v) => typeof v === 'number' && isFinite(v);
const P = (name) => { const v = Editor.getParam(name); return String(Array.isArray(v) ? (v[0] == null ? '' : v[0]) : (v == null ? '' : v)).trim(); };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
function numStr(v, d) { // форматирование без Intl: 1 234 567,89
    const neg = v < 0; const s = Math.abs(v).toFixed(d); const parts = s.split('.');
    const int = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (neg ? '−' : '') + int + (parts[1] ? ',' + parts[1] : '');
}
function fmt(v) {
    if (!isNum(v)) return '—';
    const a = Math.abs(v);
    if (a >= 1000) return numStr(v, 0);
    if (a >= 1) return numStr(v, 2).replace(/,?0+$/, '');
    if (a === 0) return '0';
    return numStr(v, Math.min(8, 2 - Math.floor(Math.log10(a)))).replace(/,?0+$/, '');
}
function fmtC(v) {
    if (!isNum(v)) return '—';
    const a = Math.abs(v);
    if (a >= 1e9) return numStr(v / 1e9, a >= 1e10 ? 1 : 2) + ' млрд';
    if (a >= 1e6) return numStr(v / 1e6, a >= 1e7 ? 1 : 2) + ' млн';
    if (a >= 1e4) return numStr(v / 1e3, a >= 1e5 ? 0 : 1) + ' тыс.';
    return fmt(v);
}
const fmtS = (v) => !isNum(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + fmtC(Math.abs(v));
const sgn = (v) => !isNum(v) ? '—' : (v > 0 ? '+' : '') + fmt(v);
const pct = (b, a) => isNum(a) && isNum(b) && a !== 0 ? (b - a) / Math.abs(a) * 100 : NaN;
const fmtP = (v) => !isNum(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + numStr(Math.abs(v), 1) + '%';
function parseNum(x) {
    if (typeof x === 'number') return isFinite(x) ? x : NaN;
    if (x == null) return NaN;
    let s = String(x).trim(); if (!s) return NaN;
    s = s.replace(/[     ']/g, '').replace(/[−–—]/g, '-');
    let neg = false; if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    s = s.replace(/%$/, '');
    if (/,/.test(s) && /\./.test(s)) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (/,/.test(s)) s = s.match(/,/g).length > 1 ? s.replace(/,/g, '') : s.replace(',', '.');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN;
    const v = parseFloat(s); return neg ? -v : v;
}
/* ---------- периоды: ключ месяца = год*12 + (месяц-1) ---------- */
const MON = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONRE = [[/^(янв|jan)/i, 0], [/^(фев|feb)/i, 1], [/^(мар|mar)/i, 2], [/^(апр|apr)/i, 3], [/^(мая|май|may)/i, 4], [/^(июн|jun)/i, 5], [/^(июл|jul)/i, 6], [/^(авг|aug)/i, 7], [/^(сен|sep)/i, 8], [/^(окт|oct)/i, 9], [/^(ноя|nov)/i, 10], [/^(дек|dec)/i, 11]];
function parsePeriod(raw) {
    if (raw == null) return null;
    let s = String(raw).trim().toLowerCase().replace(/\s+/g, ' '); if (!s) return null;
    const Y = (y) => { y = +y; if (y < 100) y += 2000; return y >= 1900 && y <= 2200 ? y : NaN; };
    const mw = (w) => { for (const [re, m] of MONRE) if (re.test(w)) return m; return -1; };
    const qk = (y, q) => { q = {i: 1, ii: 2, iii: 3, iv: 4}[q] || +q; y = Y(y); return y ? {key: y * 12 + (q - 1) * 3, g: 'Q'} : null; };
    let m;
    if ((m = s.match(/^(\d{4})[-./ ](\d{1,2})(?:[-./ ]\d{1,2})?(?:[ t].*)?$/)) && +m[2] >= 1 && +m[2] <= 12) return {key: Y(m[1]) * 12 + (+m[2] - 1), g: 'M'};
    if ((m = s.match(/^\d{1,2}[./-](\d{1,2})[./-](\d{2,4})(?: .*)?$/)) && +m[1] >= 1 && +m[1] <= 12 && Y(m[2])) return {key: Y(m[2]) * 12 + (+m[1] - 1), g: 'M'};
    if ((m = s.match(/^(\d{1,2})[./-](\d{4})$/)) && +m[1] >= 1 && +m[1] <= 12) return {key: Y(m[2]) * 12 + (+m[1] - 1), g: 'M'};
    if ((m = s.match(/^(\d{4})[- ]?(?:q|кв\.?|квартал)[ ]?([1-4]|iv|iii|ii|i)$/))) return qk(m[1], m[2]);
    if ((m = s.match(/^(?:q|кв\.?)[ ]?([1-4])[ ,-]*(\d{2,4})$/))) return qk(m[2], m[1]);
    if ((m = s.match(/^([1-4]|iv|iii|ii|i)[ -]?(?:q|кв\.?|квартал)[ .,-]*(\d{2,4})(?: ?г\.?)?$/))) return qk(m[2], m[1]);
    if ((m = s.match(/^([a-zа-яё]+)\.?[ ,-]*(\d{2,4})(?: ?г\.?)?$/i))) { const mo = mw(m[1]), y = Y(m[2]); if (mo >= 0 && y) return {key: y * 12 + mo, g: 'M'}; }
    if ((m = s.match(/^(\d{4})(?: ?г\.?|год)?$/)) && Y(m[1])) return {key: Y(m[1]) * 12, g: 'Y'};
    return null;
}
const pLabel = (k, g) => g === 'Y' ? String(Math.floor(k / 12)) : g === 'Q' ? ['I', 'II', 'III', 'IV'][Math.floor((k % 12) / 3)] + ' кв ' + Math.floor(k / 12) : MON[k % 12] + ' ' + Math.floor(k / 12);
const pIso = (k) => Math.floor(k / 12) + '-' + String(k % 12 + 1).padStart(2, '0');

/* ---------------------------- модель ---------------------------- */
const FA_METHODS = {chain: 'Цепных подстановок', abs: 'Абсолютных разниц', rel: 'Относительных разниц', index: 'Индексный', integral: 'Интегральный', log: 'Логарифмический', shapley: 'Шепли (взвешенных конечных разностей)', prop: 'Пропорционального деления'};
const FA_SHORT = {chain: 'Цепные подст.', abs: 'Абс. разниц', rel: 'Отн. разниц', index: 'Индексный', integral: 'Интегральный', log: 'Логарифм.', shapley: 'Шепли', prop: 'Пропорц. деления'};
const FA_NA = {rel: 'только для произведения факторов (a × b × c)', index: 'только для произведений и частных', log: 'только для произведений и частных', prop: 'нужна сумма факторов в формуле, например (b + c)', integral: 'разрыв модели на пути от базы к отчёту'};
const FA_TYPES = {additive: 'аддитивная (сумма факторов)', multiplicative: 'мультипликативная (произведение)', multiple: 'кратная (отношение)', mixed: 'смешанная'};

function parseModel(text, names) {
    const s = String(text), toks = [];
    for (let i = 0; i < s.length;) {
        const c = s[i];
        if (/\s/.test(c)) { i++; continue; }
        if (c === '[') {
            const j = s.indexOf(']', i); if (j < 0) throw new Error('В формуле не закрыта скобка ] после названия поля.');
            const nm = s.slice(i + 1, j).trim(); if (names && !names.includes(nm)) throw new Error('В данных нет поля «' + nm + '». Проверьте название в fa_formula.');
            toks.push({t: 'var', nm}); i = j + 1; continue;
        }
        if (/[0-9]/.test(c)) { let j = i; while (j < s.length && /[0-9.,]/.test(s[j])) j++; toks.push({t: 'num', v: parseFloat(s.slice(i, j).replace(',', '.'))}); i = j; continue; }
        const op = {'×': '*', '·': '*', '*': '*', '÷': '/', '/': '/', ':': '/', '+': '+', '-': '-', '−': '-', '–': '-', '(': '(', ')': ')', '^': '^'}[c];
        if (!op) throw new Error('Непонятный символ «' + c + '» в формуле.');
        toks.push({t: 'op', v: op}); i++;
    }
    let pos = 0; const vars = [];
    const eat = (v) => { const tk = toks[pos]; if (tk && tk.t === 'op' && tk.v === v) { pos++; return true; } return false; };
    const expr = () => { let a = term(); for (;;) { if (eat('+')) a = {t: 'bin', op: '+', a, b: term()}; else if (eat('-')) a = {t: 'bin', op: '-', a, b: term()}; else return a; } };
    const term = () => { let a = power(); for (;;) { if (eat('*')) a = {t: 'bin', op: '*', a, b: power()}; else if (eat('/')) a = {t: 'bin', op: '/', a, b: power()}; else return a; } };
    const power = () => { const a = unary(); return eat('^') ? {t: 'bin', op: '^', a, b: power()} : a; };
    const unary = () => eat('-') ? {t: 'neg', a: unary()} : eat('+') ? unary() : primary();
    const primary = () => {
        const tk = toks[pos]; if (!tk) throw new Error('Формула обрывается — допишите её.');
        if (tk.t === 'num') { pos++; return {t: 'num', v: tk.v}; }
        if (tk.t === 'var') { pos++; let k = vars.indexOf(tk.nm); if (k < 0) { vars.push(tk.nm); k = vars.length - 1; } return {t: 'var', i: k}; }
        if (eat('(')) { const e = expr(); if (!eat(')')) throw new Error('В формуле не хватает закрывающей скобки ).'); return e; }
        throw new Error('Формула записана с ошибкой: проверьте знаки и скобки.');
    };
    const ast = expr();
    if (pos < toks.length) throw new Error('Формула записана с ошибкой: лишний знак или скобка.');
    if (!vars.length) throw new Error('В формуле нет ни одного поля в [квадратных скобках].');
    const ev = (n, x) => { if (n.t === 'num') return n.v; if (n.t === 'var') return x[n.i]; if (n.t === 'neg') return -ev(n.a, x); const a = ev(n.a, x), b = ev(n.b, x); return n.op === '+' ? a + b : n.op === '-' ? a - b : n.op === '*' ? a * b : n.op === '/' ? a / b : Math.pow(a, b); };
    const hasVar = (n) => n.t === 'var' || (!!n.a && hasVar(n.a)) || (!!n.b && hasVar(n.b));
    const pp = (n) => {
        if (n.t === 'num') return {c: n.v, p: {}};
        if (n.t === 'var') return {c: 1, p: {[n.i]: 1}};
        if (n.t === 'neg') { const r = pp(n.a); return r && {c: -r.c, p: r.p}; }
        if (n.op === '*' || n.op === '/') { const a = pp(n.a), b = pp(n.b); if (!a || !b) return null; const p = Object.assign({}, a.p), sg = n.op === '*' ? 1 : -1; for (const k in b.p) p[k] = (p[k] || 0) + sg * b.p[k]; return {c: n.op === '*' ? a.c * b.c : a.c / b.c, p}; }
        if (n.op === '^' && !hasVar(n.b)) { const a = pp(n.a); if (!a) return null; const e = ev(n.b, []); const p = {}; for (const k in a.p) p[k] = a.p[k] * e; return {c: Math.pow(a.c, e), p}; }
        return null;
    };
    const lin = (n) => {
        if (n.t === 'num') return {c0: n.v, co: {}};
        if (n.t === 'var') return {c0: 0, co: {[n.i]: 1}};
        const scale = (r, m) => { if (!r) return null; const co = {}; for (const k in r.co) co[k] = r.co[k] * m; return {c0: r.c0 * m, co}; };
        if (n.t === 'neg') return scale(lin(n.a), -1);
        if (n.op === '+' || n.op === '-') { const a = lin(n.a), b = lin(n.b); if (!a || !b) return null; const sg = n.op === '+' ? 1 : -1; const co = Object.assign({}, a.co); for (const k in b.co) co[k] = (co[k] || 0) + sg * b.co[k]; return {c0: a.c0 + sg * b.c0, co}; }
        if (n.op === '*') { if (!hasVar(n.a)) return scale(lin(n.b), ev(n.a, [])); if (!hasVar(n.b)) return scale(lin(n.a), ev(n.b, [])); return null; }
        if (n.op === '/' && !hasVar(n.b)) return scale(lin(n.a), 1 / ev(n.b, []));
        return null;
    };
    const Pp = pp(ast);
    const okPP = !!Pp && Object.keys(Pp.p).length === vars.length && vars.every((_, i) => Math.abs(Pp.p[i] || 0) > 1e-12);
    const L = lin(ast);
    const groups = [], used = new Set();
    (function find(n) {
        if (!n || n.t === 'num' || n.t === 'var') return;
        if (n.t === 'bin' && (n.op === '+' || n.op === '-')) { const r = lin(n); const vs = r ? Object.keys(r.co).map(Number).filter((k) => r.co[k] !== 0) : []; if (r && vs.length >= 2) { if (!vs.some((v) => used.has(v))) { groups.push({vars: vs, co: r.co}); vs.forEach((v) => used.add(v)); } return; } }
        if (n.a) find(n.a); if (n.b) find(n.b);
    })(ast);
    const ratio = (n) => n.t === 'bin' && n.op === '/' ? {num: n.a, den: n.b} : n.t === 'bin' && n.op === '*' ? (!hasVar(n.b) ? ratio(n.a) : !hasVar(n.a) ? ratio(n.b) : null) : null;
    const rt = ratio(ast);
    const type = L ? 'additive' : okPP ? (Object.values(Pp.p).every((v) => v > 0) ? 'multiplicative' : 'multiple') : rt && pp(rt.num) && lin(rt.den) ? 'multiple' : 'mixed';
    const pureMult = okPP && Object.values(Pp.p).every((v) => Math.abs(v - 1) < 1e-12);
    const applicable = {chain: true, abs: true, integral: true, shapley: vars.length <= 12, rel: pureMult, index: okPP, log: okPP, prop: type === 'additive' || groups.length > 0};
    return {vars, fn: (x) => ev(ast, x), pp: okPP ? Pp : null, pureMult, lin: L, groups, type, applicable};
}

function faMethod(M, m, xa, xb, ord) {
    const F = M.fn, k = M.vars.length, ya = F(xa), yb = F(xb);
    if (!isNum(ya) || !isNum(yb)) return null;
    const eff = new Array(k).fill(0);
    if (m === 'chain' || m === 'abs') { let cur = xa.slice(), prev = ya; for (const i of ord) { cur[i] = xb[i]; const y = F(cur); eff[i] = y - prev; prev = y; } }
    else if (m === 'rel') { if (!M.pureMult || xa.some((v) => v === 0)) return null; let acc = ya; for (const i of ord) { eff[i] = acc * (xb[i] - xa[i]) / xa[i]; acc += eff[i]; } }
    else if (m === 'index') { if (!M.pp || xa.some((v) => v === 0)) return null; let cum = 1; for (const i of ord) { const ip = Math.pow(xb[i] / xa[i], M.pp.p[i]); if (!isNum(ip)) return null; eff[i] = ya * cum * (ip - 1); cum *= ip; } }
    else if (m === 'log') {
        if (!M.pp) return null; const I = xb.map((v, i) => v / xa[i]); if (I.some((v) => !isNum(v) || !(v > 0))) return null;
        const iy = yb / ya; if (!(iy > 0)) return null;
        if (Math.abs(Math.log(iy)) < 1e-12) { if (!I.every((v) => Math.abs(Math.log(v)) < 1e-12)) return null; }
        else for (let i = 0; i < k; i++) eff[i] = (yb - ya) * M.pp.p[i] * Math.log(I[i]) / Math.log(iy);
    } else if (m === 'integral') {
        const nodes = [-0.9815606342, -0.9041172564, -0.7699026742, -0.5873179543, -0.3678314990, -0.1252334085, 0.1252334085, 0.3678314990, 0.5873179543, 0.7699026742, 0.9041172564, 0.9815606342];
        const wts = [0.0471753364, 0.1069393260, 0.1600783285, 0.2031674267, 0.2334925365, 0.2491470458, 0.2491470458, 0.2334925365, 0.2031674267, 0.1600783285, 0.1069393260, 0.0471753364];
        for (let q = 0; q < nodes.length; q++) {
            const t = (nodes[q] + 1) / 2, w = wts[q] / 2, x = xa.map((v, i) => v + t * (xb[i] - v));
            for (let i = 0; i < k; i++) { const h = 1e-6 * Math.max(Math.abs(x[i]), 1), xp = x.slice(), xm = x.slice(); xp[i] += h; xm[i] -= h; eff[i] += w * (F(xp) - F(xm)) / (2 * h) * (xb[i] - xa[i]); }
        }
    } else if (m === 'shapley') {
        if (k > 12) return null;
        const n = 1 << k, vals = new Array(n);
        for (let s = 0; s < n; s++) vals[s] = F(xa.map((v, i) => (s >> i) & 1 ? xb[i] : v));
        const fact = [1]; for (let i = 1; i <= k; i++) fact[i] = fact[i - 1] * i;
        for (let i = 0; i < k; i++) for (let s = 0; s < n; s++) if (!((s >> i) & 1)) { let c = 0; for (let j = 0; j < k; j++) if ((s >> j) & 1) c++; eff[i] += fact[c] * fact[k - c - 1] / fact[k] * (vals[s | (1 << i)] - vals[s]); }
    } else if (m === 'prop') {
        let groups = M.groups; if (M.type === 'additive') groups = [{vars: M.vars.map((_, i) => i), co: M.lin.co}];
        if (!groups.length) return null;
        const done = new Set(); let cur = xa.slice(), prev = ya;
        for (const i of ord) {
            if (done.has(i)) continue;
            const g = groups.find((gg) => gg.vars.includes(i)); const unit = g ? g.vars : [i];
            unit.forEach((j) => { cur[j] = xb[j]; done.add(j); });
            const y = F(cur), ue = y - prev; prev = y;
            if (!g) { eff[i] = ue; continue; }
            const w = g.vars.map((j) => (xb[j] - xa[j]) * (g.co[j] || 0)), sw = w.reduce((a, b) => a + b, 0);
            if (Math.abs(sw) > 1e-12 * Math.max(...w.map(Math.abs), 1e-300)) g.vars.forEach((j, q) => { eff[j] = ue * w[q] / sw; });
            else { const j0 = g.vars.find((j) => g.co[j]); const h = 1e-6 * Math.max(Math.abs(cur[j0]), 1); const xp = cur.slice(), xm = cur.slice(); xp[j0] += h; xm[j0] -= h; const dYdL = (F(xp) - F(xm)) / (2 * h) / g.co[j0]; g.vars.forEach((j, q) => { eff[j] = dYdL * w[q]; }); }
        }
    } else return null;
    const sm = eff.reduce((a, b) => a + b, 0);
    if (!isNum(sm) || Math.abs(sm - (yb - ya)) > 1e-6 * Math.max(Math.abs(yb - ya), Math.abs(ya), Math.abs(yb), 1)) return null;
    return {ya, yb, eff};
}

/* ---------------------------- данные ---------------------------- */
function loadRows(columns) {
    let rows = null;
    try { rows = Dataset.getDatasetRows({datasetName: 'faData'}); } catch (e) { rows = null; }
    if (Array.isArray(rows) && rows.length && !Array.isArray(rows[0])) return rows;
    const loaded = Editor.getLoadedData() || {}; const src = loaded.faData || {};
    const res = src.result || src; const data = (res.data && (res.data.Data || res.data.data)) || res.Data || [];
    return data.map((r) => { const o = {}; columns.forEach((c, i) => { o[c] = Array.isArray(r) ? r[i] : r[c]; }); return o; });
}
function guessAvg(name) { return /цен|price|тариф|ставк|rate|курс|%|процент|доля|share|рентаб|средн|avg|average|чек|остат|stock|индекс|index/i.test(name); }

/* ---------------------------- расчёт ---------------------------- */
function computeFA(opt) {
    const fPeriod = P('fa_period'), fPos = P('fa_position'), fGroup = P('fa_group');
    const formula = P('fa_formula');
    if (!fPeriod) throw new Error('Не задано поле периода (параметр fa_period).');
    if (!formula) throw new Error('Не задана формула (параметр fa_formula), например [Продано, шт.] * [Цена, руб.].');
    const M = parseModel(formula, null);
    const avgList = P('fa_avg_fields').split(';').map((s) => s.trim()).filter(Boolean);
    const isAvg = M.vars.map((v) => avgList.length ? avgList.includes(v) : guessAvg(v));
    const columns = [fPeriod, fPos, fGroup].concat(M.vars).filter((c, i, a) => c && a.indexOf(c) === i);
    const rows = loadRows(columns);
    if (!rows.length) throw new Error('Датасет вернул 0 строк. Проверьте ID датасета на вкладке Meta и названия полей на вкладке Params.');
    const missing = columns.filter((c) => !(c in rows[0]));
    if (missing.length) throw new Error('В датасете нет полей: ' + missing.join(', ') + '. Есть: ' + Object.keys(rows[0]).join(', '));
    // агрегирование позиция × период
    const gOrd = {M: 0, Q: 1, Y: 2}; let gMin = 2; const bad = [];
    const parsed = rows.map((r) => { const p = parsePeriod(r[fPeriod]); if (p) gMin = Math.min(gMin, gOrd[p.g]); else if (bad.length < 3) bad.push(String(r[fPeriod])); return p; });
    const G = ['M', 'Q', 'Y'][gMin];
    const gk = (k) => G === 'M' ? k : G === 'Q' ? Math.floor(k / 12) * 12 + Math.floor((k % 12) / 3) * 3 : Math.floor(k / 12) * 12;
    const cell = new Map(), posInfo = new Map(), keySet = new Set();
    const grpFilter = P('fa_group_filter');
    rows.forEach((r, i) => {
        const p = parsed[i]; if (!p) return;
        const grp = fGroup ? String(r[fGroup] == null ? '' : r[fGroup]) : '';
        if (grpFilter && grp !== grpFilter) return;
        const pos = fPos ? String(r[fPos] == null ? '—' : r[fPos]) : 'Итого';
        const key = gk(p.key); keySet.add(key);
        if (!posInfo.has(pos)) posInfo.set(pos, grp);
        const id = pos + '\u0001' + key;
        let c = cell.get(id); if (!c) { c = {s: M.vars.map(() => 0), n: M.vars.map(() => 0)}; cell.set(id, c); }
        M.vars.forEach((v, j) => { const x = parseNum(r[v]); if (isNum(x)) { c.s[j] += x; c.n[j]++; } });
    });
    if (!keySet.size) throw new Error('Не удалось распознать периоды в поле «' + fPeriod + '»' + (bad.length ? ' (например: ' + bad.join(', ') + ')' : '') + '. Нужны даты или месяцы.');
    const keys = Array.from(keySet).sort((a, b) => a - b);
    const val = (pos, key) => { const c = cell.get(pos + '\u0001' + key); if (!c) return null; return M.vars.map((_, j) => c.n[j] ? (isAvg[j] ? c.s[j] / c.n[j] : c.s[j]) : NaN); };
    // выбор периодов
    const pb = P('fa_period_b'), cmp = P('fa_compare') || 'yoy';
    let kb = keys[keys.length - 1]; const notes = [];
    if (pb && pb !== 'last') { const p = parsePeriod(pb); if (p && keys.includes(gk(p.key))) kb = gk(p.key); else notes.push('Период «' + pb + '» не найден в данных — взят последний.'); }
    let ka = null;
    if (cmp === 'prev') { const i = keys.indexOf(kb); ka = i > 0 ? keys[i - 1] : null; }
    else if (cmp === 'custom') { const p = parsePeriod(P('fa_period_a')); ka = p && keys.includes(gk(p.key)) ? gk(p.key) : null; if (!ka) notes.push('Базисный период fa_period_a не найден.'); }
    else ka = keys.includes(kb - 12) ? kb - 12 : null;
    const la = ka == null ? (cmp === 'yoy' ? pLabel(kb - 12, G) : '—') : pLabel(ka, G), lb = pLabel(kb, G);
    const nav = {periods: keys.map(pIso), labels: keys.map((k) => pLabel(k, G)), cur: keys.indexOf(kb), cmp};
    const base = {resultName: P('fa_result_name') || 'Результат', formula, vars: M.vars, type: M.type, typeName: FA_TYPES[M.type], applicable: M.applicable, la, lb, nav, notes, groupFilter: grpFilter};
    if (ka == null) return Object.assign(base, {empty: 'Нет данных для периода сравнения «' + la + '». Выберите другой период или режим сравнения.'});
    // порядок подстановки
    const ordNames = P('fa_order').split(';').map((s) => s.trim()).filter((s) => M.vars.includes(s));
    const ord = ordNames.concat(M.vars.filter((v) => !ordNames.includes(v))).map((v) => M.vars.indexOf(v));
    // расчёт по позициям
    const methods = Object.keys(FA_METHODS).filter((m) => M.applicable[m]);
    const R = {}; methods.forEach((m) => { R[m] = {eff: new Array(M.vars.length).fill(0), fb: 0}; });
    let Ya = 0, Yb = 0, newE = 0, goneE = 0, skipped = 0; const per = [];
    posInfo.forEach((grp, pos) => {
        const xa = val(pos, ka), xb = val(pos, kb);
        const okA = !!xa && xa.every(isNum), okB = !!xb && xb.every(isNum);
        if (!okA && !okB) return;
        if (okA && !okB) { const y = M.fn(xa); if (isNum(y)) { goneE -= y; Ya += y; } return; }
        if (!okA && okB) { const y = M.fn(xb); if (isNum(y)) { newE += y; Yb += y; } return; }
        const b0 = faMethod(M, 'shapley', xa, xb, ord) || faMethod(M, 'chain', xa, xb, ord);
        if (!b0) { skipped++; return; }
        Ya += b0.ya; Yb += b0.yb; const pm = {};
        methods.forEach((m) => { const r = m === 'shapley' ? b0 : faMethod(M, m, xa, xb, ord); if (!r) { R[m].fb++; b0.eff.forEach((e, i) => { R[m].eff[i] += e; }); pm[m] = null; } else { r.eff.forEach((e, i) => { R[m].eff[i] += e; }); pm[m] = r.eff; } });
        per.push({name: pos, group: grp, xa, xb, ya: b0.ya, yb: b0.yb, d: b0.yb - b0.ya, per: pm});
    });
    per.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    const dY = Yb - Ya, k = M.vars.length;
    // устойчивость к порядку подстановки
    let order = null;
    if (k >= 2 && k <= 6) { // 6! = 720 порядков — укладываемся в лимит времени DataLens
        let perms = [[0]]; for (let n = 1; n < k; n++) { const nx = []; perms.forEach((p) => { for (let q = 0; q <= p.length; q++) nx.push(p.slice(0, q).concat([n], p.slice(q))); }); perms = nx; }
        const mat = perms.map(() => new Array(k).fill(0));
        per.forEach((r) => { const n = 1 << k, vals = new Array(n); for (let s = 0; s < n; s++) vals[s] = M.fn(r.xa.map((v, i) => (s >> i) & 1 ? r.xb[i] : v)); if (vals.some((v) => !isNum(v))) return; perms.forEach((p, q) => { let mm = 0; p.forEach((i) => { mat[q][i] += vals[mm | (1 << i)] - vals[mm]; mm |= 1 << i; }); }); });
        const key = ord.join(','), ci = perms.findIndex((p) => p.join(',') === key);
        order = {n: perms.length, stat: M.vars.map((v, i) => { const col = mat.map((r) => r[i]); const mn = Math.min(...col), mx = Math.max(...col); return {name: v, min: mn, max: mx, mean: col.reduce((a, b) => a + b, 0) / col.length, chain: mat[ci][i], flip: mn < 0 && mx > 0}; })};
    }
    // чувствительность: эластичности и ±10% (от базисного периода)
    const tot = (sc) => per.reduce((s, r) => { const y = M.fn(r.xa.map((v, i) => v * (sc[i] == null ? 1 : sc[i]))); return isNum(y) ? s + y : s; }, 0);
    const Y0 = tot([]);
    const sens = M.vars.map((v, i) => { const sc = (d) => { const a = new Array(k).fill(1); a[i] = 1 + d; return tot(a); }; return {name: v, el: Y0 ? (sc(0.01) - sc(-0.01)) / 0.02 / Y0 : NaN, lo: sc(-0.1) - Y0, hi: sc(0.1) - Y0}; });
    // подробный расчёт по позициям (крупнейшие 60)
    const sub = (i, w) => esc(M.vars[i]) + (w ? '₁' : '₀');
    const detail = per.slice(0, 60).map((r) => {
        const steps = [{label: 'Y₀ (базисный)', vals: M.vars.map((_, i) => sub(i, 0)).join(', '), y: r.ya, eff: null}];
        let cur = r.xa.slice(), prev = r.ya; const done = [];
        ord.forEach((i, q) => { cur[i] = r.xb[i]; done.push(i); const y = M.fn(cur); steps.push({label: q === k - 1 ? 'Y₁ (отчётный)' : 'Y усл.' + (q + 1), vals: M.vars.map((_, j) => sub(j, done.includes(j))).join(', '), y, eff: y - prev, f: M.vars[i]}); prev = y; });
        const lines = {};
        const L = (m, s) => { (lines[m] = lines[m] || []).push(s); };
        if (M.pureMult && r.per.abs) {
            const cs = M.pp.c !== 1 ? fmt(M.pp.c) + ' × ' : '';
            ord.forEach((i, q) => { const bf = ord.slice(0, q), af = ord.slice(q + 1);
                L('abs', 'ΔY(' + esc(M.vars[i]) + ') = ' + cs + bf.map((j) => sub(j, 1)).concat(['Δ' + esc(M.vars[i])], af.map((j) => sub(j, 0))).join(' × ') + ' = ' + cs + bf.map((j) => fmt(r.xb[j])).concat(['(' + sgn(r.xb[i] - r.xa[i]) + ')'], af.map((j) => fmt(r.xa[j]))).join(' × ') + ' = <b>' + sgn(r.per.abs[i]) + '</b>'); });
        } else if (r.per.abs) ord.forEach((i) => L('abs', 'ΔY(' + esc(M.vars[i]) + ') = Y(…, ' + sub(i, 1) + ', …) − Y(…, ' + sub(i, 0) + ', …) = <b>' + sgn(r.per.abs[i]) + '</b>'));
        if (r.per.rel) { let acc = r.ya; ord.forEach((i) => { const pc = (r.xb[i] - r.xa[i]) / r.xa[i] * 100; L('rel', 'ΔY(' + esc(M.vars[i]) + ') = ' + fmt(acc) + ' × ' + numStr(pc, 3) + '% / 100 = <b>' + sgn(acc * pc / 100) + '</b>'); acc += acc * pc / 100; }); }
        if (r.per.index) { let cum = 1; ord.forEach((i) => { const ip = Math.pow(r.xb[i] / r.xa[i], M.pp.p[i]); L('index', 'ΔY(' + esc(M.vars[i]) + ') = Y₀ × ' + (cum === 1 ? '' : numStr(cum, 4) + ' × ') + '(I − 1) = ' + fmt(r.ya) + ' × ' + (cum === 1 ? '' : numStr(cum, 4) + ' × ') + '(' + numStr(ip, 4) + ' − 1) = <b>' + sgn(r.per.index[i]) + '</b>'); cum *= ip; }); }
        if (r.per.log && r.yb / r.ya > 0 && Math.abs(Math.log(r.yb / r.ya)) > 1e-12) { const ly = Math.log(r.yb / r.ya); M.vars.forEach((v, i) => L('log', 'ΔY(' + esc(v) + ') = ΔY × ' + (M.pp.p[i] !== 1 ? fmt(M.pp.p[i]) + ' × ' : '') + 'ln I / ln I(Y) = ' + sgn(r.d) + ' × ' + numStr(Math.log(r.xb[i] / r.xa[i]), 5) + ' / ' + numStr(ly, 5) + ' = <b>' + sgn(r.per.log[i]) + '</b>')); }
        if (k === 2 && M.pureMult && r.per.integral) { const da = r.xb[0] - r.xa[0], db = r.xb[1] - r.xa[1];
            L('integral', 'ΔY(' + esc(M.vars[0]) + ') = Δ' + esc(M.vars[0]) + ' × ' + sub(1, 0) + ' + Δ' + esc(M.vars[0]) + ' × Δ' + esc(M.vars[1]) + ' / 2 = ' + sgn(da) + ' × ' + fmt(r.xa[1]) + ' + ' + sgn(da) + ' × ' + sgn(db) + ' / 2 = <b>' + sgn(r.per.integral[0]) + '</b>');
            L('integral', 'ΔY(' + esc(M.vars[1]) + ') = Δ' + esc(M.vars[1]) + ' × ' + sub(0, 0) + ' + Δ' + esc(M.vars[0]) + ' × Δ' + esc(M.vars[1]) + ' / 2 = ' + sgn(db) + ' × ' + fmt(r.xa[0]) + ' + ' + sgn(da) + ' × ' + sgn(db) + ' / 2 = <b>' + sgn(r.per.integral[1]) + '</b>');
        } else if (r.per.integral) M.vars.forEach((v, i) => L('integral', 'ΔY(' + esc(v) + ') = ∫ ∂Y/∂' + esc(v) + ' по пути от базы к отчёту = <b>' + sgn(r.per.integral[i]) + '</b>'));
        if (r.per.shapley) M.vars.forEach((v, i) => L('shapley', 'ΔY(' + esc(v) + ') = среднее по всем порядкам подстановки = <b>' + sgn(r.per.shapley[i]) + '</b>'));
        if (r.per.prop) M.vars.forEach((v, i) => L('prop', 'ΔY(' + esc(v) + ') = <b>' + sgn(r.per.prop[i]) + '</b>'));
        methods.forEach((m) => { if (r.per[m] === null) L(m, 'к значениям этой позиции метод неприменим (нули или смена знака)'); });
        return {name: r.name, group: r.group, xa: r.xa, xb: r.xb, ya: r.ya, yb: r.yb, d: r.d, per: r.per, steps, lines};
    });
    // выводы (по каждому методу — для переключения на клиенте)
    const conclusions = {};
    methods.forEach((m) => {
        const C = []; const eff = R[m].eff;
        C.push({k: dY >= 0 ? 'up' : 'down', t: base.resultName + ' ' + (dY > 0 ? 'вырос' : dY < 0 ? 'снизился' : 'не изменился') + ' с <b>' + fmtC(Ya) + '</b> до <b>' + fmtC(Yb) + '</b> (' + esc(la) + ' → ' + esc(lb) + '): на <b>' + fmtS(dY) + '</b> (' + fmtP(pct(Yb, Ya)) + ').'});
        const items = M.vars.map((v, i) => ({v, e: eff[i]})); if (newE) items.push({v: 'Новые позиции', e: newE}); if (goneE) items.push({v: 'Выбывшие позиции', e: goneE});
        const sh = (e) => dY ? ' — ' + (e / dY < 0 ? '−' : '') + numStr(Math.abs(e / dY * 100), 0) + '% изменения' : '';
        const up = items.filter((x) => x.e > 0).sort((a, b) => b.e - a.e), dn = items.filter((x) => x.e < 0).sort((a, b) => a.e - b.e);
        if (up.length) C.push({k: 'up', t: 'Увеличили: ' + up.map((x) => '<b>' + esc(x.v) + '</b> ' + fmtS(x.e) + sh(x.e)).join('; ') + '.'});
        if (dn.length) C.push({k: 'down', t: 'Уменьшили: ' + dn.map((x) => '<b>' + esc(x.v) + '</b> ' + fmtS(x.e) + sh(x.e)).join('; ') + '.'});
        const top = items.slice().sort((a, b) => Math.abs(b.e) - Math.abs(a.e))[0];
        if (top) C.push({k: 'info', t: 'Определяющий фактор — <b>' + esc(top.v) + '</b> (' + fmtS(top.e) + ').'});
        if (order) { const fl = order.stat.filter((s) => s.flip), spread = Math.max(...order.stat.map((s) => s.max - s.min));
            if (fl.length) C.push({k: 'warn', t: 'Знак влияния ' + fl.map((s) => '<b>' + esc(s.name) + '</b>').join(', ') + ' зависит от порядка подстановки — опирайтесь на интегральный метод или Шепли.'});
            else if (dY && spread / Math.abs(dY) > 0.05) C.push({k: 'warn', t: 'Цепные методы зависят от порядка подстановки (разброс до ' + numStr(spread / Math.abs(dY) * 100, 0) + '% изменения) — сверяйтесь с интегральным методом и Шепли.'});
            else C.push({k: 'info', t: 'От порядка подстановки результат почти не зависит — выводы устойчивы.'}); }
        if (R[m].fb) C.push({k: 'warn', t: 'Для ' + R[m].fb + ' поз. метод неприменим к их значениям (нули, смена знака) — для них взят метод Шепли.'});
        C.push({k: 'info', t: 'Проверка баланса: сумма влияний равна изменению результата.'});
        conclusions[m] = C;
    });
    let method = P('fa_method'); if (!M.applicable[method]) method = 'chain';
    return Object.assign(base, {
        method, methods, ord: ord.map((i) => M.vars[i]),
        R: methods.reduce((o, m) => { o[m] = {eff: R[m].eff, fb: R[m].fb}; return o; }, {}),
        Ya, Yb, dY, newE, goneE, skipped, positionsTotal: per.length,
        positions: per.slice(0, opt && opt.all ? per.length : 200).map((r) => ({name: r.name, group: r.group, ya: r.ya, yb: r.yb, d: r.d, per: r.per})),
        detail, order, sens, conclusions,
        names: FA_METHODS, short: FA_SHORT, na: FA_NA,
    });
}

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
