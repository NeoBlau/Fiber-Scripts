
/* =====================================================================
   Чарт-таблица: влияние факторов по каждой позиции (сортировка, Excel).
   ===================================================================== */
let T;
try { T = computeFA({all: true}); } catch (e) { T = {error: String(e && e.message || e)}; }

const cellN = (v, txt) => ({value: isNum(v) ? v : null, formattedValue: txt != null ? txt : (isNum(v) ? fmt(v) : '—'), type: 'number'});
const cellT = (v) => ({value: String(v == null ? '' : v), type: 'text'});
let table;
if (T.error || T.empty) {
    table = {head: [{id: 'msg', name: 'Факторный анализ', type: 'text'}], rows: [{cells: [cellT(T.error || T.empty)]}]};
} else {
    const m = T.method, effName = (v) => 'Влияние: ' + v;
    const head = [
        {id: 'pos', name: P('fa_position') || 'Позиция', type: 'text'},
        {id: 'grp', name: P('fa_group') || 'Группа', type: 'text'},
        {id: 'ya', name: T.resultName + ' · ' + T.la, type: 'number'},
        {id: 'yb', name: T.resultName + ' · ' + T.lb, type: 'number'},
        {id: 'd', name: 'Изменение', type: 'number'},
        {id: 'dp', name: 'Изменение, %', type: 'number'},
    ].concat(T.vars.map((v, i) => ({id: 'f' + i, name: effName(v), type: 'number'})));
    const rows = T.positions.map((p) => {
        const pe = p.per[m] || p.per.shapley || p.per.chain || [];
        const dp = pct(p.yb, p.ya);
        return {cells: [cellT(p.name), cellT(p.group), cellN(p.ya), cellN(p.yb), cellN(p.d, sgn(p.d)), cellN(dp, fmtP(dp))].concat(T.vars.map((_, i) => cellN(pe[i], sgn(pe[i]))))};
    });
    if (T.newE) rows.push({cells: [cellT('Новые позиции'), cellT(''), cellN(0), cellN(T.newE), cellN(T.newE, sgn(T.newE)), cellN(null)].concat(T.vars.map(() => cellN(null)))});
    if (T.goneE) rows.push({cells: [cellT('Выбывшие позиции'), cellT(''), cellN(-T.goneE), cellN(0), cellN(T.goneE, sgn(T.goneE)), cellN(null)].concat(T.vars.map(() => cellN(null)))});
    const dpT = pct(T.Yb, T.Ya);
    const footer = [{cells: [cellT('Итого · метод: ' + T.names[m] + (T.positionsTotal > T.positions.length ? ' (в таблице ' + T.positions.length + ' крупнейших из ' + T.positionsTotal + ')' : '')), cellT(''), cellN(T.Ya), cellN(T.Yb), cellN(T.dY, sgn(T.dY)), cellN(dpT, fmtP(dpT))].concat(T.R[m].eff.map((e) => cellN(e, sgn(e))))}];
    table = {head, rows, footer};
}
module.exports = table;
