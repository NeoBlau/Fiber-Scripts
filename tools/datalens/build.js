// Сборка вкладок Prepare для DataLens: core.js + хвост → DataLens/4_..., 5_...
const fs = require('fs'), path = require('path');
const here = __dirname, out = path.join(here, '..', '..', 'DataLens');
const core = fs.readFileSync(path.join(here, 'core.js'), 'utf8');
const head = '// Вставьте этот файл целиком во вкладку Prepare. Настройки — во вкладке Params.\n';
const app = fs.readFileSync(path.join(here, 'app_core.js'), 'utf8');
for (const [tail, name, extra] of [['tail_chart.js', '4_Prepare_FactorAnalysis.js', app], ['tail_table.js', '5_Prepare_Table.js', '']]) {
    fs.writeFileSync(path.join(out, name), head + core + extra + fs.readFileSync(path.join(here, tail), 'utf8'));
    console.log('built', name);
}
// встроить код плагина в Fiber Pulse (раздел «Плагин DataLens»)
const fp = path.join(here, '..', '..', 'FiberPulse', 'FiberPulse.html');
let html = fs.readFileSync(fp, 'utf8');
const code = (n) => { const t = fs.readFileSync(path.join(out, n), 'utf8'); if (/<\/script/i.test(t)) throw new Error('</script> в ' + n); return t; };
const block = '<!--DL-CODE-START-->\n<script type="text/plain" id="dl-code-chart">\n' + code('4_Prepare_FactorAnalysis.js') + '</script>\n<script type="text/plain" id="dl-code-table">\n' + code('5_Prepare_Table.js') + '</script>\n<!--DL-CODE-END-->';
html = html.replace(/<!--DL-CODE-START-->[\s\S]*?<!--DL-CODE-END-->/, () => block);
fs.writeFileSync(fp, html);
console.log('embedded into FiberPulse.html');
