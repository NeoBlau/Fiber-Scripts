# =============================================================================
#  ДФА на СВОИХ данных — заполните раздел «НАСТРОЙКИ» и нажмите Source
#  (или: Rscript examples/run_my_data.R из папки проекта)
# =============================================================================

# ---------------------------- НАСТРОЙКИ --------------------------------------
# 1) Путь к вашему файлу (CSV из Excel, XLSX, TXT). На Windows — прямые слэши:
#    "C:/Users/Иван/Documents/мои_данные.csv"
DATA_FILE <- "examples/template_my_data.csv"

# 2) Модель: результат = формула из названий столбцов вашего файла
MODEL <- "PR = Q * (Pr - V) - FC"

# 3) Столбец с периодами (План/Факт, годы, месяцы). NULL — строки идут по порядку
PERIOD_COL <- "period"

# 4) Столбец с объектами (филиалы, магазины, товары). NULL — объектов нет
GROUP_COL <- NULL

# 5) Понятные названия для отчёта и графиков (можно оставить c())
RESPONSE_LABEL <- "Прибыль от продаж, руб."
FACTOR_LABELS  <- c(Q  = "Объём продаж, шт.",
                    Pr = "Цена за ед., руб.",
                    V  = "Переменные затраты на ед., руб.",
                    FC = "Постоянные затраты, руб.")

# 6) Схема сравнения: "auto" (2 периода: база→отчёт; больше — цепная),
#    "first_last", "chain", "fixed_base"
COMPARE <- "auto"

# 7) Основной метод для графиков и выводов:
#    "chain", "integral", "shapley", "abs_diff", "log", "index", "rel_diff", "proportional"
MAIN_METHOD <- "chain"

# 8) Папка для результатов
OUTPUT_DIR <- "dfa_my_results"

# 9) TRUE — вместо расчёта открыть окно настроек с этими параметрами
OPEN_GUI <- FALSE
# -----------------------------------------------------------------------------

DFA_NO_RUN <- TRUE
script <- c("deterministic_factor_analysis.R", "../deterministic_factor_analysis.R")
script <- script[file.exists(script)]
if (!length(script)) stop("Не найден deterministic_factor_analysis.R — выполните setwd() в папку проекта")
source(script[1], encoding = "UTF-8")

my_cfg <- list(
  demo = NULL, data_file = DATA_FILE, model = MODEL,
  period_col = PERIOD_COL, group_col = GROUP_COL,
  response_label = RESPONSE_LABEL, factor_labels = FACTOR_LABELS,
  compare = COMPARE, main_method = MAIN_METHOD, output_dir = OUTPUT_DIR
)

if (OPEN_GUI) {
  res <- dfa_gui(my_cfg)
} else {
  res <- dfa_run(my_cfg)
  cat("\nОткройте папку с результатами:", normalizePath(OUTPUT_DIR), "\n")
  # res$results[[1]]$effects  — влияние факторов по всем методам
  # res$tables$effects_long   — всё в одной таблице
}
