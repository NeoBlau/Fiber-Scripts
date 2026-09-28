# =============================================================================
#   ДЕТЕРМИНИРОВАННЫЙ ФАКТОРНЫЙ АНАЛИЗ — ЗАПУСК
#
#   Откройте этот файл в RStudio и нажмите кнопку «Source» (справа над кодом)
#   или Ctrl+Shift+S (Windows) / Cmd+Shift+S (Mac).
#   В консоли появится меню — введите номер пункта и нажмите Enter.
# =============================================================================

local({
  # переходим в папку, где лежит этот файл
  here <- tryCatch(dirname(normalizePath(sys.frame(1)$ofile)), error = function(e) NULL)
  if (is.null(here) && requireNamespace("rstudioapi", quietly = TRUE) && rstudioapi::isAvailable())
    here <- tryCatch(dirname(rstudioapi::getSourceEditorContext()$path), error = function(e) NULL)
  if (!is.null(here) && file.exists(file.path(here, "deterministic_factor_analysis.R"))) setwd(here)
})
if (!file.exists("deterministic_factor_analysis.R"))
  stop("Не найден deterministic_factor_analysis.R. Откройте START.R из папки проекта и нажмите Source.")

DFA_NO_RUN <- TRUE
source("deterministic_factor_analysis.R", encoding = "UTF-8")

dfa_start <- function() {
  repeat {
    k <- utils::menu(c(
      "Анализ моих данных (пошаговый мастер: выбрать файл → указать модель → готово)",
      "Проверка на случайных данных (убедиться, что всё работает)",
      "Посмотреть пример (демо-данные)",
      "Повторить прошлый анализ моих данных",
      "Окно настроек со всеми параметрами (на Mac нужен XQuartz)",
      "Выход"),
      title = "\nДетерминированный факторный анализ. Что сделать?")
    if (k == 0 || k == 6) break
    tryCatch(switch(k,
      dfa_wizard(),
      source("examples/run_random_test.R", encoding = "UTF-8"),
      {
        demos <- c(mixed = "Прибыль = объём × (цена − перем. затраты) − пост. затраты",
                   multiplicative = "Выручка = численность × дни × часы × выработка",
                   multiple = "Рентабельность активов = прибыль / (ОС + ОбС)",
                   additive = "Себестоимость = сумма статей затрат",
                   dupont = "ROE по Дюпону, 6 лет",
                   groups = "Выручка по 4 филиалам")
        d <- utils::menu(demos, title = "Какой пример?")
        if (d > 0) assign("res", dfa_run(list(demo = names(demos)[d])), envir = globalenv())
      },
      {
        if (!file.exists("last_analysis.R")) cat("\nПрошлого анализа нет — сначала выберите пункт 1.\n")
        else assign("res", dfa_run(dfa_config_read("last_analysis.R")), envir = globalenv())
      },
      dfa_gui()
    ), error = function(e) cat("\nОШИБКА:", conditionMessage(e), "\n"))
    if (utils::menu(c("вернуться в меню", "закончить"), title = "\nДальше?") != 1) break
  }
  cat("\nСнова открыть меню: dfa_start()\n",
      "Графики последнего расчёта: dfa_show(res)   все: dfa_show(res, mode = \"all\")\n", sep = "")
  invisible()
}

if (interactive()) dfa_start() else cat("Запустите этот файл в RStudio (кнопка Source) — появится меню.\n")
