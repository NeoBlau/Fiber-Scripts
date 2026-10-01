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
    if (/^-?\d+(\.\d+)?$/.test(s)) return +s; // быстрый путь: DataLens отдаёт «1234.5»
    s = s.replace(/[\s\u00a0\u2007\u202f\u2009']/g, '').replace(/[−–—]/g, '-');
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
const PERIOD_CACHE = new Map();
function parsePeriod(raw) {
    if (raw == null) return null;
    const ck = String(raw); if (PERIOD_CACHE.has(ck)) return PERIOD_CACHE.get(ck);
    const res = parsePeriodRaw(raw); if (PERIOD_CACHE.size < 20000) PERIOD_CACHE.set(ck, res); return res;
}
function parsePeriodRaw(raw) {
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
    // формула → готовая функция (быстрее обхода дерева на каждом вычислении)
    const comp = (n) => {
        if (n.t === 'num') { const c = n.v; return () => c; }
        if (n.t === 'var') { const i = n.i; return (x) => x[i]; }
        if (n.t === 'neg') { const a = comp(n.a); return (x) => -a(x); }
        const a = comp(n.a), b = comp(n.b);
        if (n.op === '+') return (x) => a(x) + b(x);
        if (n.op === '-') return (x) => a(x) - b(x);
        if (n.op === '*') return (x) => a(x) * b(x);
        if (n.op === '/') return (x) => a(x) / b(x);
        return (x) => Math.pow(a(x), b(x));
    };
    return {vars, fn: comp(ast), pp: okPP ? Pp : null, pureMult, lin: L, groups, type, applicable};
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
            for (let i = 0; i < k; i++) { if (xb[i] === xa[i]) continue; const x0 = x[i], h = 1e-6 * Math.max(Math.abs(x0), 1); x[i] = x0 + h; const fp = F(x); x[i] = x0 - h; const fm = F(x); x[i] = x0; eff[i] += w * (fp - fm) / (2 * h) * (xb[i] - xa[i]); }
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
    const rows = (opt && opt.rows) || loadRows(columns);
    if (!rows.length) throw new Error('Датасет вернул 0 строк. Проверьте ID датасета на вкладке Meta и названия полей на вкладке Params.');
    const missing = columns.filter((c) => !(c in rows[0]));
    if (missing.length) throw new Error('В датасете нет полей: ' + missing.join(', ') + '. Есть: ' + Object.keys(rows[0]).join(', '));
    // агрегирование позиция × период
    const gOrd = {M: 0, Q: 1, Y: 2}; let gMin = 2; const bad = [];
    const parsed = rows.map((r) => { const p = parsePeriod(r[fPeriod]); if (p) gMin = Math.min(gMin, gOrd[p.g]); else if (bad.length < 3) bad.push(String(r[fPeriod])); return p; });
    const G = ['M', 'Q', 'Y'][Math.max(gMin, {M: 0, Q: 1, Y: 2}[P('fa_grain')] || 0)];
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
        const budget = Math.max(50, Math.floor(200000 / perms.length)), ordPer = per.slice(0, budget); // per уже отсортирован по |Δ|
        ordPer.forEach((r) => { const n = 1 << k, vals = new Array(n); for (let s = 0; s < n; s++) vals[s] = M.fn(r.xa.map((v, i) => (s >> i) & 1 ? r.xb[i] : v)); if (vals.some((v) => !isNum(v))) return; perms.forEach((p, q) => { let mm = 0; p.forEach((i) => { mat[q][i] += vals[mm | (1 << i)] - vals[mm]; mm |= 1 << i; }); }); });
        const key = ord.join(','), ci = perms.findIndex((p) => p.join(',') === key);
        order = {n: perms.length, sample: ordPer.length < per.length ? ordPer.length : 0, stat: M.vars.map((v, i) => { const col = mat.map((r) => r[i]); const mn = Math.min(...col), mx = Math.max(...col); return {name: v, min: mn, max: mx, mean: col.reduce((a, b) => a + b, 0) / col.length, chain: mat[ci][i], flip: mn < 0 && mx > 0}; })};
    }
    // чувствительность: эластичности и ±10% (от базисного периода)
    const tot = (sc) => per.reduce((s, r) => { const y = M.fn(r.xa.map((v, i) => v * (sc[i] == null ? 1 : sc[i]))); return isNum(y) ? s + y : s; }, 0);
    const Y0 = tot([]);
    const sens = M.vars.map((v, i) => { const sc = (d) => { const a = new Array(k).fill(1); a[i] = 1 + d; return tot(a); }; return {name: v, el: Y0 ? (sc(0.01) - sc(-0.01)) / 0.02 / Y0 : NaN, lo: sc(-0.1) - Y0, hi: sc(0.1) - Y0}; });
    // подробный расчёт по позициям (крупнейшие 60)
    const sub = (i, w) => esc(M.vars[i]) + (w ? '₁' : '₀');
    const detail = per.slice(0, opt && opt.lite ? 30 : 60).map((r) => {
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
            else C.push({k: 'info', t: 'От порядка подстановки результат почти не зависит — выводы устойчивы.'});
            if (order.sample) C.push({k: 'info', t: 'Устойчивость к порядку оценена по ' + order.sample + ' крупнейшим изменениям из ' + per.length + ' позиций (ограничение времени расчёта).'}); }
        if (R[m].fb) C.push({k: 'warn', t: 'Для ' + R[m].fb + ' поз. метод неприменим к их значениям (нули, смена знака) — для них взят метод Шепли.'});
        C.push({k: 'info', t: 'Проверка баланса: сумма влияний равна изменению результата.'});
        conclusions[m] = C;
    });
    let method = P('fa_method'); if (!M.applicable[method]) method = 'chain';
    return Object.assign(base, {
        method, methods, ord: ord.map((i) => M.vars[i]),
        R: methods.reduce((o, m) => { o[m] = {eff: R[m].eff, fb: R[m].fb}; return o; }, {}),
        Ya, Yb, dY, newE, goneE, skipped, positionsTotal: per.length,
        positions: per.slice(0, opt && opt.all ? per.length : opt && opt.lite ? 60 : 200).map((r) => ({name: r.name, group: r.group, ya: r.ya, yb: r.yb, d: r.d, per: r.per})),
        detail, order, sens, conclusions,
        names: FA_METHODS, short: FA_SHORT, na: FA_NA,
    });
}

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
