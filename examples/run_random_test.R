# =============================================================================
#  Проверка ДФА на случайных данных
#  Запуск:  Rscript examples/run_random_test.R          (из папки репозитория)
#     или:  в RStudio открыть файл и нажать Source
#  Что делает:
#   1) генерирует 3 случайных набора данных и сохраняет их в CSV;
#   2) прогоняет анализ по каждому (2 периода, 6 периодов, 5 филиалов);
#   3) проверяет, что Σ влияний = ΔY для всех методов;
#   4) по желанию открывает окно настроек (OPEN_GUI <- TRUE).
# =============================================================================

SEED     <- 2026    # поменяйте, чтобы получить другие случайные данные
OPEN_GUI <- FALSE   # TRUE — после расчётов открыть окно настроек со случайными данными
OUT_DIR  <- "dfa_random_test"

# ---- 1. Подключаем скрипт анализа (без автозапуска) ---------------------------
find_script <- function() {
  cand <- c("deterministic_factor_analysis.R", "../deterministic_factor_analysis.R")
  this <- tryCatch(dirname(normalizePath(sys.frame(1)$ofile)), error = function(e) NULL)
  if (!is.null(this)) cand <- c(file.path(this, "..", "deterministic_factor_analysis.R"), cand)
  hit <- cand[file.exists(cand)]
  if (!length(hit)) stop("Не найден deterministic_factor_analysis.R — задайте setwd() в папку репозитория")
  hit[1]
}
DFA_NO_RUN <- TRUE
source(find_script(), encoding = "UTF-8")
set.seed(SEED)
dir.create(OUT_DIR, showWarnings = FALSE)

# Случайное изменение: значение × (1 + N(mean, sd))
jitter <- function(x, mean = 0.03, sd = 0.06) round(x * (1 + rnorm(length(x), mean, sd)), 4)

# ---- 2. Набор 1: смешанная модель, план/факт ----------------------------------
# Прибыль = Объём × (Цена − Перем. затраты на ед.) − Постоянные затраты
base1 <- c(Q = round(runif(1, 5000, 20000)), Pr = round(runif(1, 500, 1500)),
           V = NA, FC = round(runif(1, 1e6, 3e6)))
base1["V"] <- round(base1["Pr"] * runif(1, 0.4, 0.7))
data1 <- data.frame(period = c("План", "Факт"), round(rbind(base1, jitter(base1)), 2),
                    check.names = FALSE, row.names = NULL)
data1$Q <- round(data1$Q)
write.csv2(data1, file.path(OUT_DIR, "random_mixed.csv"), row.names = FALSE, fileEncoding = "UTF-8")

# ---- 3. Набор 2: мультипликативная модель, 6 лет подряд ------------------------
# Выручка = Численность × Дни × Часы × Часовая выработка
years <- as.character(2020:2025)
data2 <- data.frame(year = years,
                    CR = round(cumprod(c(100, 1 + rnorm(5, 0.02, 0.04))) ),
                    D  = round(250 + rnorm(6, 0, 5)),
                    P  = round(7.8 + rnorm(6, 0, 0.15), 2),
                    CV = round(cumprod(c(0.25, 1 + rnorm(5, 0.04, 0.05))), 4))
write.csv2(data2, file.path(OUT_DIR, "random_periods.csv"), row.names = FALSE, fileEncoding = "UTF-8")

# ---- 4. Набор 3: кратная модель, 5 филиалов × 2 года ----------------------------
# Рентабельность активов = Прибыль / (Осн. средства + Обор. средства) × 100
branches <- c("Москва", "Казань", "Новосибирск", "Екатеринбург", "Самара")
data3 <- do.call(rbind, lapply(branches, function(b) {
  x0 <- c(P = runif(1, 500, 5000), F = runif(1, 5000, 30000), E = runif(1, 3000, 15000))
  data.frame(branch = b, period = c("2024", "2025"), round(rbind(x0, jitter(x0, 0.05, 0.12)), 1),
             check.names = FALSE, row.names = NULL)
}))
write.csv2(data3, file.path(OUT_DIR, "random_groups.csv"), row.names = FALSE, fileEncoding = "UTF-8")

cat("\nСлучайные данные (seed =", SEED, "):\n")
print(data1); print(data2); print(data3)

# ---- 5. Запуск анализа ----------------------------------------------------------
res1 <- dfa_run(list(
  demo = NULL, data_file = file.path(OUT_DIR, "random_mixed.csv"),
  model = "PR = Q * (Pr - V) - FC", period_col = "period",
  base_label = "План", report_label = "Факт",
  response_label = "Прибыль от продаж, руб.",
  factor_labels = c(Q = "Объём продаж, шт.", Pr = "Цена, руб.",
                    V = "Перем. затраты на ед., руб.", FC = "Постоянные затраты, руб."),
  output_dir = file.path(OUT_DIR, "1_mixed")))

res2 <- dfa_run(list(
  demo = NULL, data = data2, model = "V = CR * D * P * CV", period_col = "year",
  compare = "chain", main_method = "integral",
  response_label = "Выпуск продукции, тыс. руб.",
  factor_labels = c(CR = "Численность, чел.", D = "Дней на рабочего",
                    P = "Часов в смене", CV = "Часовая выработка"),
  factor_types = c(CR = "quantitative", D = "quantitative", P = "quantitative", CV = "qualitative"),
  order = "auto", plots_per_pair = FALSE, verbose = FALSE,
  output_dir = file.path(OUT_DIR, "2_periods")))

res3 <- dfa_run(list(
  demo = NULL, data = data3, model = "R = P / (F + E) * 100",
  period_col = "period", group_col = "branch",
  response_label = "Рентабельность активов, %",
  factor_labels = c(P = "Прибыль", F = "Основные средства", E = "Оборотные средства"),
  plots_per_pair = FALSE, verbose = FALSE,
  output_dir = file.path(OUT_DIR, "3_groups")))

# ---- 6. Самопроверка ---------------------------------------------------------------
check <- function(name, res) {
  ok <- all(vapply(res$results, function(r) all(r$balance$ok), logical(1)))
  n_m <- length(unique(unlist(lapply(res$results, `[[`, "ok_methods"))))
  cat(sprintf("%-28s расчётов: %2d | методов: %d | баланс: %s | файлов: %d\n",
              name, length(res$results), n_m, if (ok) "OK" else "ОШИБКА", length(res$files)))
  ok
}
cat("\n================ ИТОГ ПРОВЕРКИ ================\n")
all_ok <- all(check("1. Смешанная, план/факт", res1),
              check("2. Мультипликат., 6 лет", res2),
              check("3. Кратная, 5 филиалов", res3))
cat(if (all_ok) "\nВсё сошлось. " else "\nЕсть ошибки! ",
    "Результаты: ", normalizePath(OUT_DIR), "\n", sep = "")

# Графики на экране (RStudio → вкладка Plots, листать стрелками):
#   dfa_show(res1); dfa_show(res2, mode = "all"); dfa_show(res3, "heatmap")
# Быстрый доступ к цифрам:
#   res1$results[[1]]$effects        — влияние факторов по всем методам
#   res2$tables$effects_long         — всё в одной таблице
#   res3$tables$summary              — ΔY по филиалам

# ---- 7. Окно настроек (по желанию) ---------------------------------------------------
if (OPEN_GUI) dfa_gui(list(demo = NULL, data = data3, model = "R = P / (F + E) * 100",
                           period_col = "period", group_col = "branch",
                           output_dir = file.path(OUT_DIR, "gui")))
