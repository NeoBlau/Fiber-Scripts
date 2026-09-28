# Установка и первый запуск

Скрипту нужен только R. Дополнительные пакеты ставить не нужно: всё работает на базовом R.

## Шаг 1. Установите R (один раз)

1. **R** — https://cran.r-project.org
   - Windows: «Download R for Windows» → «base» → «Download R-x.x.x for Windows», запустить установщик, везде «Далее».
   - macOS: «Download R for macOS» → выбрать `.pkg` под ваш процессор (Apple Silicon — `arm64`, Intel — `x86_64`).
   - Linux (Ubuntu/Debian): `sudo apt install r-base`
2. **RStudio** (по желанию, удобнее работать) — https://posit.co/download/rstudio-desktop/
3. **Только для macOS**: для окна настроек нужен XQuartz — https://www.xquartz.org.
   Без него расчёты и графики работают, но окно не откроется.

Для кириллицы на Windows нужен R версии 4.2 или новее.

## Шаг 2. Скачайте проект и проверьте его на случайных данных

Откройте R или RStudio, вставьте код в консоль и нажмите Enter:

```r
url <- "https://github.com/NeoBlau/Fiber-Scripts/archive/refs/heads/claude/deterministic-factor-analysis-r-pnfmty.zip"
dir <- file.path(path.expand("~"), "DFA")
dir.create(dir, showWarnings = FALSE)
zip <- file.path(dir, "dfa.zip")
download.file(url, zip, mode = "wb")
unzip(zip, exdir = dir)
setwd(file.path(dir, "Fiber-Scripts-claude-deterministic-factor-analysis-r-pnfmty"))
source("examples/run_random_test.R", encoding = "UTF-8")
```

Что произойдёт:

1. Проект скачается в папку `DFA` в домашней папке (на Windows обычно `Документы\DFA`).
2. Сгенерируются 3 случайных набора данных: смешанная модель (план/факт), мультипликативная (6 лет),
   кратная (5 филиалов).
3. По каждому пройдёт анализ, в конце появится итог:

```
================ ИТОГ ПРОВЕРКИ ================
1. Смешанная, план/факт расчётов:  1 | методов: 5 | баланс: OK | файлов: 20
2. Мультипликат., 6 лет расчётов:  5 | методов: 7 | баланс: OK | файлов: 24
3. Кратная, 5 филиалов расчётов:  5 | методов: 5 | баланс: OK | файлов: 13

Всё сошлось.
```

Результаты — отчёты, таблицы CSV, графики PNG и общий PDF — лежат в папке `dfa_random_test`
внутри проекта. Путь к проекту покажет команда `getwd()`.

Другие случайные данные: откройте `examples/run_random_test.R` и поменяйте `SEED` в начале файла.

## Шаг 3. Окно настроек

В той же консоли, после шага 2:

```r
DFA_NO_RUN <- TRUE
source("deterministic_factor_analysis.R", encoding = "UTF-8")
dfa_gui()
```

Откроется окно с вкладками. В нём можно:
- выбрать демо-набор или свой файл (CSV / Excel);
- ввести модель и нажать «Проверить модель»;
- настроить методы, подписи и графики;
- нажать «Запустить анализ».

Отчёт появится на вкладке «Журнал / отчёт», графики откроются кнопкой «Открыть PDF».

## В следующий раз

Скачивать заново не нужно, достаточно перейти в папку проекта:

```r
setwd(file.path(path.expand("~"), "DFA", "Fiber-Scripts-claude-deterministic-factor-analysis-r-pnfmty"))
DFA_NO_RUN <- TRUE
source("deterministic_factor_analysis.R", encoding = "UTF-8")
dfa_gui()
```

Чтобы обновить скрипт до свежей версии, повторите код из шага 2: он скачает проект поверх старого.

## Через git (для тех, кто им пользуется)

```bash
git clone -b claude/deterministic-factor-analysis-r-pnfmty https://github.com/NeoBlau/Fiber-Scripts.git
cd Fiber-Scripts
Rscript examples/run_random_test.R      # проверка на случайных данных
Rscript tests/test_dfa.R                # проверки корректности
Rscript deterministic_factor_analysis.R --gui
```

## Если что-то не работает

| Проблема | Что делать |
|---|---|
| Ошибка при `download.file` | Проверьте интернет, прокси или антивирус. Или скачайте ZIP вручную по ссылке из первой строки кода, распакуйте в `Документы\DFA` и выполните только две последние строки кода. |
| `cannot change working directory` | Папка называется иначе: выполните `list.files(dir)` и подставьте имя в `setwd(...)`. |
| Вместо русских букв «кракозябры» | Обновите R до 4.2+ (Windows) и вызывайте `source(..., encoding = "UTF-8")`. |
| Окно настроек не открывается (macOS) | Установите XQuartz и перезапустите R. |
| Окно не открывается (RStudio Server, удалённый сервер) | Там нет графического экрана. Используйте `dfa_edit_config()` или конфиг-файл: `Rscript deterministic_factor_analysis.R --config=examples/my_config.R` |
| Нужен Excel на выходе | `install.packages("openxlsx")` — после этого появится `dfa_results.xlsx`. |
| Нужно читать `.xlsx` на входе | `install.packages("readxl")` (или сохраните файл из Excel как CSV). |
