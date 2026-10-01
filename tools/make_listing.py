"""Листинг исходного текста (один или несколько файлов подряд) для депонирования в Роспатенте:
первые 10 и последние 10 страниц, сквозная нумерация. Результат — PDF (Chromium)."""
import html, sys, asyncio
OUT, TITLE, SRCS = sys.argv[1], sys.argv[2], sys.argv[3:]
COLS, ROWS = 100, 58
lines = []
text = ''
for f in SRCS:
    t = open(f, encoding='utf-8').read().replace('\ufeff', '')
    text += ('' if len(SRCS) == 1 else '\n/* ===== файл: ' + f + ' ===== */\n') + t
for raw in text.replace('\t', '    ').split('\n'):
    raw = raw.rstrip('\r')
    if not raw: lines.append(''); continue
    while len(raw) > COLS: lines.append(raw[:COLS]); raw = raw[COLS:]
    lines.append(raw)
pages = [lines[i:i + ROWS] for i in range(0, len(lines), ROWS)]
N = len(pages)
pick = list(range(N)) if N <= 20 else list(range(10)) + list(range(N - 10, N))
out = ['<meta charset=utf-8><style>@page{size:A4;margin:14mm 12mm 14mm 16mm}body{margin:0}'
       '.p{page-break-after:always;font:8.6pt/1.22 "DejaVu Sans Mono",monospace}.p:last-child{page-break-after:auto}'
       '.h{font:9pt "DejaVu Sans",sans-serif;border-bottom:1px solid #000;padding-bottom:3px;margin-bottom:6px;display:flex;justify-content:space-between}'
       'pre{margin:0;white-space:pre;font:inherit}</style>']
for i in pick:
    body = '\n'.join(html.escape(l) for l in pages[i])
    out.append(f'<div class=p><div class=h><span>{html.escape(TITLE)} — исходный текст</span><span>Страница {i + 1} из {N}</span></div><pre>{body}</pre></div>')
open('/tmp/listing.html', 'w', encoding='utf-8').write(''.join(out))
import subprocess
subprocess.run(['node', '-e', "import('/opt/node22/lib/node_modules/playwright/index.mjs').then(async({chromium})=>{const b=await chromium.launch();const p=await b.newPage();await p.goto('file:///tmp/listing.html');await p.pdf({path:process.argv[1],format:'A4',preferCSSPageSize:true});await b.close();})", OUT], check=True)
print(f'строк {len(lines)}, страниц листинга {N}, в файле {len(pick)}')
