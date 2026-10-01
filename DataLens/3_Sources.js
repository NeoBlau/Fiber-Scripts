// =====================================================================
//  FIBER PULSE для DataLens — вкладка Sources
//  Ничего менять не нужно: поля берутся из параметров на вкладке Params.
// =====================================================================
const {buildSource} = require('libs/dataset/v2');

const p = (name) => {
    const v = Editor.getParam(name);
    return String(Array.isArray(v) ? (v[0] ?? '') : (v ?? '')).trim();
};
const formulaFields = [];
p('fa_formula').replace(/\[([^\]]+)\]/g, (_, name) => {
    name = name.trim();
    if (!formulaFields.includes(name)) formulaFields.push(name);
    return '';
});
const metricFields = p('fa_metrics').split(';').map((s) => s.trim()).filter(Boolean);
const columns = [p('fa_period'), p('fa_position'), p('fa_group'), ...metricFields, ...formulaFields]
    .filter((c, i, all) => c && all.indexOf(c) === i);

module.exports = {
    faData: buildSource({
        datasetId: Editor.getId('faDataset'),
        columns,
    }),
};
