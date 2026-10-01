// Сборка вкладок Prepare для DataLens: core.js + хвост → DataLens/4_..., 5_...
const fs = require('fs'), path = require('path');
const here = __dirname, out = path.join(here, '..', '..', 'DataLens');
const core = fs.readFileSync(path.join(here, 'core.js'), 'utf8');
const head = '// Вставьте этот файл целиком во вкладку Prepare. Настройки — во вкладке Params.\n';
for (const [tail, name] of [['tail_chart.js', '4_Prepare_FactorAnalysis.js'], ['tail_table.js', '5_Prepare_Table.js']]) {
    fs.writeFileSync(path.join(out, name), head + core + fs.readFileSync(path.join(here, tail), 'utf8'));
    console.log('built', name);
}
