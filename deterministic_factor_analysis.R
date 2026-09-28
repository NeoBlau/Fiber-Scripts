#!/usr/bin/env Rscript
# =============================================================================
#  ДЕТЕРМИНИРОВАННЫЙ ФАКТОРНЫЙ АНАЛИЗ (ДФА) — полный пакет в одном R-скрипте
# =============================================================================
#
#  Что умеет:
#   * Любая модель: аддитивная, мультипликативная, кратная, смешанная,
#     а также произвольная формула с функциями R (log, exp, sqrt, pmax, ...)
#     или вообще R-функция. Многоуровневые модели (подстановка подмоделей).
#   * Методы элиминирования:
#       chain        — цепных подстановок (любая модель, задаётся порядок)
#       abs_diff     — абсолютных разниц (мультипликативные модели)
#       rel_diff     — относительных разниц (мультипликативные модели)
#       index        — индексный (мультипликативные и кратные модели x^p)
#       integral     — интегральный (любая дифференцируемая модель)
#       log          — логарифмический (мультипликативные и кратные x^p)
#       shapley      — взвешенных конечных разностей / Шепли
#                      (среднее по всем порядкам подстановки, без остатка)
#       proportional — пропорционального деления / долевого участия
#                      (аддитивные модели и суммы внутри любых моделей)
#   * Анализ чувствительности к порядку подстановки (все перестановки).
#   * Эластичности и «торнадо» (что будет при изменении фактора на ±N%).
#   * Сравнение двух периодов (база/отчёт, план/факт), динамика по многим
#     периодам (цепная / базисная), несколько объектов (групп) сразу.
#   * Проверка баланса (сумма влияний = общему изменению) для каждого метода.
#   * Отчёт: консоль + TXT + CSV (+ XLSX, если есть openxlsx) + RDS.
#   * Графики (PNG + общий PDF): каскадная диаграмма (водопад), влияние
#     факторов, структура влияния, сравнение методов, чувствительность к
#     порядку, цепочка условных показателей, темпы роста факторов,
#     эластичности, торнадо, динамика и тепловые карты по периодам/группам,
#     сводная панель (dashboard).
#
#  Зависимости: только базовый R (>= 3.5). Необязательно: readxl/openxlsx
#  (чтение/запись Excel), data.table не нужен.
#
#  Запуск:
#    Rscript deterministic_factor_analysis.R                      # демо по умолчанию
#    Rscript deterministic_factor_analysis.R --demo=mixed         # другое демо
#    Rscript deterministic_factor_analysis.R --demo=all           # все демо
#    Rscript deterministic_factor_analysis.R --data=my.csv --model="Y = a*b*c"
#    Rscript deterministic_factor_analysis.R --config=my_config.R # свой конфиг
#    Другие ключи: --out=папка --order=a,b,c --method=integral --compare=chain
#                  --group=столбец_групп --period=столбец_периодов
#  Из R:
#    DFA_NO_RUN <- TRUE; source("deterministic_factor_analysis.R")
#    res <- dfa_analyze("V = a*b*c", data = df)          # функция-API
#    dfa_run(modifyList(CONFIG, list(model = "...", data = df)))
#
#  Демо: multiplicative, multiple, mixed, additive, dupont, groups, custom
# =============================================================================


# =============================================================================
# 0. НАСТРОЙКИ (CONFIG) — меняйте здесь или передайте свой список в dfa_run()
# =============================================================================
CONFIG <- list(

  # ---- Источник данных ------------------------------------------------------
  # demo      : имя демо-набора (см. dfa_demo()); используется, если data и
  #             data_file не заданы. NULL — без демо.
  demo       = "multiplicative",
  # data      : data.frame прямо из R (имеет приоритет над data_file)
  data       = NULL,
  # data_file : путь к CSV / TXT / XLSX / XLS / RDS
  data_file  = NULL,
  sep        = "auto",       # разделитель CSV: "auto", ";", ",", "\t"
  dec        = "auto",       # десятичный знак: "auto", ",", "."
  sheet      = 1,            # лист Excel
  encoding   = "UTF-8",      # кодировка файла
  # layout    : "wide"  — строки = периоды, столбцы = факторы
  #             "long"  — строки = факторы, столбцы = периоды
  #                       (первый текстовый столбец — имена факторов)
  #             "auto"  — определить автоматически
  layout     = "auto",
  period_col = NULL,         # столбец с метками периодов (NULL = авто/по порядку)
  group_col  = NULL,         # столбец с объектами/группами (NULL = нет групп)
  auto_group = TRUE,         # искать столбец групп автоматически, если group_col = NULL
  na_action  = "stop",       # "stop" — ошибка при NA, "omit" — удалить строки

  # ---- Модель ---------------------------------------------------------------
  # Строка "Y = a * b * c", "Y ~ a*(b - c)", формула R или function(a, b) ...
  model      = NULL,
  # Подмодели (многоуровневая модель): фактор заменяется выражением.
  # Пример: list(b = "d * e") превратит Y = a*b в Y = a*(d*e).
  submodels  = list(),
  # Константы модели — НЕ факторы (не участвуют в разложении).
  constants  = list(),
  # Имя результативного показателя, если модель задана функцией.
  response_name = "Y",
  # Если в данных есть столбец с результативным показателем:
  #  "model" — брать расчётное значение по модели (рекомендуется),
  #  "data"  — фактическое (расхождение покажется как «невязка модели»)
  y_source   = "model",
  check_tolerance = 1e-6,    # допустимое относит. расхождение модели и данных

  # ---- Подписи --------------------------------------------------------------
  factor_labels   = c(),     # c(a = "Численность, чел.", b = "...")
  response_label  = NULL,    # "Выручка, тыс. руб."
  factor_types    = c(),     # c(a = "quantitative", b = "qualitative")
  base_label      = "База",  # или "План", "Прошлый год"
  report_label    = "Отчёт", # или "Факт", "Текущий год"
  title           = "Детерминированный факторный анализ",

  # ---- Сравнение периодов ---------------------------------------------------
  # "auto"       — 2 периода: база→отчёт; больше: цепная схема + итог
  # "first_last" — первый период против последнего
  # "chain"      — каждый период против предыдущего (цепная схема)
  # "fixed_base" — каждый период против первого (базисная схема)
  # "custom"     — base_period vs report_period
  compare       = "auto",
  base_period   = NULL,
  report_period = NULL,

  # ---- Методы ---------------------------------------------------------------
  methods = c("chain", "abs_diff", "rel_diff", "index",
              "integral", "log", "shapley", "proportional"),
  main_method = "chain",     # метод для основных графиков и выводов
  # Порядок подстановки для цепных/абсолютных/относительных/индексного:
  #  "model" — как факторы встречаются в модели
  #  "auto"  — сначала количественные, потом качественные (по factor_types)
  #  c("a","b","c") — явный порядок
  order = "model",
  integral_nodes   = 32,     # узлы Гаусса—Лежандра для интегрального метода
  numeric_deriv_h  = 1e-6,   # относит. шаг численной производной
  use_symbolic_deriv = TRUE, # пытаться брать производные аналитически (D())
  max_shapley_factors = 16,  # Шепли: 2^k вычислений
  all_orders       = TRUE,   # чувствительность к порядку подстановки
  max_full_orders  = 8,      # до k факторов — все k! перестановок
  n_random_orders  = 5000,   # больше — случайная выборка перестановок
  proportional_groups = NULL,# list("Затраты" = c("b","c")); NULL — автопоиск сумм
  seed             = 42,

  # ---- Чувствительность -----------------------------------------------------
  sensitivity   = TRUE,
  tornado_pct   = 10,        # ±% изменения каждого фактора
  sensitivity_point = "base",# "base" или "report" — точка расчёта эластичностей

  # ---- Вывод ----------------------------------------------------------------
  output_dir  = "dfa_output",
  digits      = 2,           # знаков после запятой в отчёте
  pct_digits  = 2,
  decimal_mark = ",",
  big_mark     = " ",
  csv_sep      = ";",
  csv_dec      = ",",
  save_csv     = TRUE,
  save_xlsx    = TRUE,       # если установлен openxlsx
  save_rds     = TRUE,
  save_txt     = TRUE,
  verbose      = TRUE,       # печать в консоль

  # ---- Графики --------------------------------------------------------------
  plots        = TRUE,
  plot_types   = c("dashboard", "waterfall", "effects", "shares", "methods",
                   "order", "chain_steps", "dynamics", "elasticity",
                   "tornado", "periods", "heatmap", "groups"),
  plot_png     = TRUE,
  plot_pdf     = TRUE,       # все графики в один PDF
  plots_per_pair = TRUE,     # графики для каждой пары периодов/группы
  png_width    = 10, png_height = 6.5, png_dpi = 150,  # дюймы / dpi
  base_font    = 1,          # масштаб шрифта (cex)
  waterfall_from_zero = "auto", # TRUE / FALSE / "auto"
  label_wrap   = 18,         # перенос длинных подписей (символов)
  colors = list(
    positive = "#2E9E5B", negative = "#D64545", total = "#3B6FB6",
    neutral  = "#8C8C8C", grid = "#E5E5E5", text = "#222222",
    methods  = c("#3B6FB6", "#E08E2B", "#2E9E5B", "#8E5BB5",
                 "#D64545", "#1FA3A3", "#B5892E", "#6B6B6B")
  )
)


# =============================================================================
# 1. СПРАВОЧНИКИ
# =============================================================================
DFA_METHOD_NAMES <- c(
  chain        = "Цепных подстановок",
  abs_diff     = "Абсолютных разниц",
  rel_diff     = "Относительных разниц",
  index        = "Индексный",
  integral     = "Интегральный",
  log          = "Логарифмический",
  shapley      = "Взвешенных конечных разностей (Шепли)",
  proportional = "Пропорционального деления (долевого участия)"
)
DFA_METHOD_SHORT <- c(
  chain = "Цепн. подст.", abs_diff = "Абс. разниц", rel_diff = "Отн. разниц",
  index = "Индексный", integral = "Интегральный", log = "Логарифм.",
  shapley = "Шепли", proportional = "Пропорц. деления"
)
DFA_MODEL_TYPES <- c(
  additive       = "аддитивная (Y = Σ x)",
  multiplicative = "мультипликативная (Y = Π x)",
  multiple       = "кратная (Y = x / z)",
  mixed          = "смешанная (комбинированная)",
  black_box      = "произвольная функция"
)


# =============================================================================
# 2. УТИЛИТЫ
# =============================================================================
`%||%` <- function(a, b) if (is.null(a) || length(a) == 0) b else a

dfa_msg <- function(cfg, ...) if (isTRUE(cfg$verbose)) cat(..., "\n", sep = "")

dfa_fmt <- function(x, digits = 2, cfg = NULL, sign = FALSE) {
  dm <- cfg$decimal_mark %||% ","
  bm <- cfg$big_mark %||% " "
  out <- rep("—", length(x))
  ok <- is.finite(x)
  if (any(ok)) {
    s <- formatC(round(x[ok], digits), format = "f", digits = digits,
                 big.mark = bm, decimal.mark = dm)
    if (sign) s <- ifelse(x[ok] > 0, paste0("+", s), s)
    out[ok] <- s
  }
  out
}
dfa_pct <- function(x, cfg = NULL, sign = FALSE)
  paste0(dfa_fmt(x, cfg$pct_digits %||% 2, cfg, sign), ifelse(is.finite(x), "%", ""))

dfa_safe_div <- function(a, b) {
  n <- max(length(a), length(b))
  if (n == 0) return(numeric(0))
  a2 <- rep_len(a, n); b2 <- rep_len(b, n)
  out <- a2 / b2
  out[!is.finite(b2) | b2 == 0] <- NA_real_
  names(out) <- names(a) %||% names(b)
  out
}

dfa_wrap <- function(x, width = 18)
  vapply(x, function(s) paste(strwrap(s, width), collapse = "\n"), character(1),
         USE.NAMES = FALSE)

# Все перестановки вектора (для k <= 8 это до 40 320 строк)
dfa_permutations <- function(v) {
  if (length(v) <= 1) return(matrix(v, nrow = 1))
  out <- NULL
  for (i in seq_along(v)) {
    sub <- dfa_permutations(v[-i])
    out <- rbind(out, cbind(v[i], sub))
  }
  unname(out)
}

# Узлы и веса Гаусса—Лежандра на [0, 1] (алгоритм Голуба—Уэлша)
dfa_gauss_legendre <- function(n) {
  if (n < 2) return(list(t = 0.5, w = 1))
  k <- seq_len(n - 1)
  b <- k / sqrt(4 * k^2 - 1)
  J <- matrix(0, n, n)
  J[cbind(k, k + 1)] <- b
  J[cbind(k + 1, k)] <- b
  e <- eigen(J, symmetric = TRUE)
  o <- order(e$values)
  list(t = (e$values[o] + 1) / 2, w = (2 * e$vectors[1, o]^2) / 2)
}

dfa_strip_parens <- function(e) {
  while (is.call(e) && identical(e[[1]], as.name("("))) e <- e[[2]]
  e
}

dfa_safe_name <- function(x) gsub("[^[:alnum:]_.-]+", "_", x)


# =============================================================================
# 3. ДЕМО-ДАННЫЕ
# =============================================================================
dfa_demo <- function(name = "multiplicative") {
  switch(name,
    # Классика: выручка = численность × дни × часы × часовая выработка
    multiplicative = list(
      model = "V = CR * D * P * CV",
      data = data.frame(
        period = c("План", "Факт"),
        CR = c(100, 104),       # среднесписочная численность, чел.
        D  = c(250, 245),       # дней, отработанных одним рабочим
        P  = c(7.8, 7.7),       # продолжительность смены, ч
        CV = c(0.25, 0.27)      # среднечасовая выработка, тыс. руб./ч
      ),
      period_col = "period", base_label = "План", report_label = "Факт",
      response_label = "Выпуск продукции, тыс. руб.",
      factor_labels = c(CR = "Численность рабочих, чел.",
                        D  = "Дней на 1 рабочего",
                        P  = "Продолжительность смены, ч",
                        CV = "Среднечасовая выработка, тыс. руб."),
      factor_types = c(CR = "quantitative", D = "quantitative",
                       P = "quantitative", CV = "qualitative")
    ),
    # Кратная: рентабельность активов = прибыль / (ОС + ОбС) * 100
    multiple = list(
      model = "R = P / (F + E) * 100",
      data = data.frame(
        period = c("2024", "2025"),
        P = c(1800, 2250),     # прибыль
        F = c(9000, 9800),     # основные средства
        E = c(6000, 7400)      # оборотные средства
      ),
      period_col = "period", base_label = "2024", report_label = "2025",
      response_label = "Рентабельность активов, %",
      factor_labels = c(P = "Прибыль, тыс. руб.",
                        F = "Основные средства, тыс. руб.",
                        E = "Оборотные средства, тыс. руб.")
    ),
    # Смешанная: прибыль от продаж = Q * (Ц - Зпер) - Зпост
    mixed = list(
      model = "PR = Q * (Pr - V) - FC",
      data = data.frame(
        period = c("План", "Факт"),
        Q  = c(12000, 12800),  # объём продаж, шт.
        Pr = c(850, 870),      # цена, руб./шт.
        V  = c(520, 545),      # переменные затраты на ед., руб.
        FC = c(2100000, 2250000)  # постоянные затраты, руб.
      ),
      period_col = "period", base_label = "План", report_label = "Факт",
      response_label = "Прибыль от продаж, руб.",
      factor_labels = c(Q = "Объём продаж, шт.", Pr = "Цена за ед., руб.",
                        V = "Перем. затраты на ед., руб.",
                        FC = "Постоянные затраты, руб.")
    ),
    # Аддитивная: себестоимость = материалы + оплата труда + амортизация + прочие
    additive = list(
      model = "C = M + W + A + O",
      data = data.frame(
        period = c("2024", "2025"),
        M = c(52000, 57400), W = c(31000, 33900),
        A = c(8000, 7600),   O = c(6500, 7100)
      ),
      period_col = "period", base_label = "2024", report_label = "2025",
      response_label = "Себестоимость, тыс. руб.",
      factor_labels = c(M = "Материальные затраты", W = "Оплата труда",
                        A = "Амортизация", O = "Прочие затраты")
    ),
    # Многопериодная модель Дюпона: ROE = Рент. продаж × Оборачиваемость × Фин. рычаг
    dupont = list(
      model = "ROE = NPM * AT * EM * 100",
      data = data.frame(
        year = as.character(2020:2025),
        NPM = c(0.062, 0.058, 0.071, 0.075, 0.069, 0.081),
        AT  = c(1.21, 1.15, 1.30, 1.34, 1.29, 1.38),
        EM  = c(2.10, 2.25, 2.05, 1.98, 2.02, 1.92)
      ),
      period_col = "year", compare = "chain",
      response_label = "ROE, %",
      factor_labels = c(NPM = "Рентабельность продаж", AT = "Оборачиваемость активов",
                        EM = "Мультипликатор капитала"),
      factor_types = c(NPM = "qualitative", AT = "qualitative", EM = "qualitative")
    ),
    # Несколько объектов (филиалов), модель: выручка = клиенты × чек × частота
    groups = list(
      model = "S = N * AC * FR",
      data = data.frame(
        branch = rep(c("Москва", "Казань", "Новосибирск", "Екатеринбург"), each = 2),
        period = rep(c("2024", "2025"), 4),
        N  = c(5200, 5600, 2100, 2350, 1800, 1750, 2500, 2900),
        AC = c(1.45, 1.52, 1.20, 1.18, 1.10, 1.26, 1.30, 1.28),
        FR = c(3.1, 3.0, 2.8, 3.1, 2.9, 2.9, 3.0, 3.2)
      ),
      period_col = "period", group_col = "branch",
      base_label = "2024", report_label = "2025",
      response_label = "Выручка, тыс. руб.",
      factor_labels = c(N = "Клиенты, чел.", AC = "Средний чек, тыс. руб.",
                        FR = "Частота покупок, раз")
    ),
    # Произвольная нелинейная модель с функциями R и константой
    custom = list(
      model = "Y = k * sqrt(K) * L^0.6 * exp(g)",
      constants = list(k = 1.5),
      data = data.frame(
        period = c("База", "Отчёт"),
        K = c(400, 470), L = c(120, 115), g = c(0.02, 0.05)
      ),
      period_col = "period",
      response_label = "Выпуск (производственная функция)",
      factor_labels = c(K = "Капитал", L = "Труд", g = "Технологический фактор")
    ),
    stop("Неизвестное демо: '", name, "'. Доступны: multiplicative, multiple, ",
         "mixed, additive, dupont, groups, custom")
  )
}


# =============================================================================
# 4. ЧТЕНИЕ И ПОДГОТОВКА ДАННЫХ
# =============================================================================
dfa_read_data <- function(path, sep = "auto", dec = "auto", sheet = 1,
                          encoding = "UTF-8") {
  if (!file.exists(path)) stop("Файл не найден: ", path)
  ext <- tolower(tools::file_ext(path))
  if (ext == "rds") return(as.data.frame(readRDS(path)))
  if (ext %in% c("xlsx", "xls")) {
    if (requireNamespace("readxl", quietly = TRUE))
      return(as.data.frame(readxl::read_excel(path, sheet = sheet)))
    if (ext == "xlsx" && requireNamespace("openxlsx", quietly = TRUE))
      return(openxlsx::read.xlsx(path, sheet = sheet))
    stop("Для Excel установите пакет readxl или openxlsx ",
         "(install.packages('readxl')) либо сохраните файл как CSV.")
  }
  lines <- readLines(path, n = 5, encoding = encoding, warn = FALSE)
  lines <- sub("^﻿", "", lines)
  if (identical(sep, "auto")) {
    cand <- c(";", "\t", ",", "|")
    cnt <- vapply(cand, function(s) sum(lengths(regmatches(lines, gregexpr(s, lines, fixed = TRUE)))),
                  numeric(1))
    sep <- cand[which.max(cnt)]
  }
  if (identical(dec, "auto")) dec <- if (sep == ";" || sep == "\t") "," else "."
  df <- utils::read.table(path, header = TRUE, sep = sep, dec = dec, quote = "\"'",
                          check.names = FALSE, stringsAsFactors = FALSE,
                          fileEncoding = encoding, comment.char = "",
                          strip.white = TRUE)
  names(df) <- sub("^﻿", "", names(df))
  # Числа с пробелами-разделителями тысяч и запятой: "1 234,5"
  for (j in seq_along(df)) if (is.character(df[[j]])) {
    s <- gsub("[  ]", "", df[[j]])
    s2 <- if (dec == ",") gsub(",", ".", s, fixed = TRUE) else s
    num <- suppressWarnings(as.numeric(s2))
    if (all(is.na(num) == (is.na(df[[j]]) | df[[j]] == ""))) df[[j]] <- num
  }
  df
}

# Приводит данные к виду «строки = периоды, столбцы = факторы»
dfa_prepare_data <- function(df, factors, cfg) {
  df <- as.data.frame(df, stringsAsFactors = FALSE)
  layout <- cfg$layout %||% "auto"
  chr_cols <- names(df)[!vapply(df, is.numeric, logical(1))]
  if (layout == "auto") {
    layout <- "wide"
    if (!all(factors %in% names(df)) && length(chr_cols) >= 1) {
      for (cc in chr_cols) {
        if (all(factors %in% trimws(as.character(df[[cc]])))) { layout <- "long"; break }
      }
    }
  }
  if (layout == "long") {
    key <- NULL
    for (cc in chr_cols) if (all(factors %in% trimws(as.character(df[[cc]])))) { key <- cc; break }
    if (is.null(key)) key <- chr_cols[1] %||% names(df)[1]
    num_cols <- setdiff(names(df)[vapply(df, is.numeric, logical(1))], key)
    if (length(num_cols) < 2) stop("В формате 'long' нужны минимум 2 числовых столбца (периоды).")
    keys <- trimws(as.character(df[[key]]))
    m <- t(as.matrix(df[, num_cols, drop = FALSE]))
    colnames(m) <- keys
    wide <- data.frame(.period = num_cols, m, check.names = FALSE, stringsAsFactors = FALSE)
    cfg$period_col <- ".period"
    df <- wide
  }
  miss <- setdiff(factors, names(df))
  if (length(miss)) stop("В данных нет столбцов для факторов: ", paste(miss, collapse = ", "),
                         ".\nСтолбцы в данных: ", paste(names(df), collapse = ", "))
  for (f in factors) if (!is.numeric(df[[f]])) {
    v <- suppressWarnings(as.numeric(gsub(",", ".", gsub("[  ]", "", df[[f]]))))
    if (all(is.na(v))) stop("Фактор '", f, "' не является числовым.")
    df[[f]] <- v
  }
  bad <- !stats::complete.cases(df[, factors, drop = FALSE])
  if (any(bad)) {
    if (identical(cfg$na_action, "omit")) {
      warning("Удалено строк с пропусками: ", sum(bad))
      df <- df[!bad, , drop = FALSE]
    } else stop("В данных есть пропуски (NA) в строках: ", paste(which(bad), collapse = ", "),
                ". Установите na_action = 'omit' или заполните данные.")
  }
  if (is.null(cfg$period_col)) {
    guess <- intersect(c("period", "Period", "период", "Период", "year", "год", "Год",
                         "date", "дата", ".period"), names(df))
    cfg$period_col <- if (length(guess)) guess[1] else NULL
  }
  # Автопоиск столбца групп: текстовый столбец (не период) с повторами значений
  if (is.null(cfg$group_col) && isTRUE(cfg$auto_group %||% TRUE)) {
    cand <- setdiff(names(df)[!vapply(df, is.numeric, logical(1))], c(cfg$period_col, factors))
    for (cc in cand) {
      v <- as.character(df[[cc]]); u <- unique(v)
      if (length(u) >= 2 && length(u) < length(v) && all(table(v) >= 2)) {
        cfg$group_col <- cc
        message("Столбец групп определён автоматически: '", cc, "' (отключить: auto_group = FALSE)")
        break
      }
    }
  }
  if (!is.null(cfg$group_col) && !cfg$group_col %in% names(df))
    stop("Нет столбца групп '", cfg$group_col, "'")
  if (!is.null(cfg$period_col) && !cfg$period_col %in% names(df))
    stop("Нет столбца периодов '", cfg$period_col, "'")
  list(data = df, cfg = cfg)
}


# =============================================================================
# 5. РАЗБОР МОДЕЛИ
# =============================================================================
dfa_parse_model <- function(model, submodels = list(), constants = list(),
                            response_name = "Y", cfg = list()) {
  # --- Модель-функция (чёрный ящик) ---
  if (is.function(model)) {
    args <- names(formals(model))
    b <- body(model)
    if (is.call(b) && identical(b[[1]], as.name("{")) && length(b) == 2) b <- b[[2]]
    # Простое тело-выражение без внешних переменных -> разбираем как формулу
    if (!(is.call(b) && identical(b[[1]], as.name("{"))) &&
        all(setdiff(all.vars(b), args) %in% names(constants)))
      return(dfa_parse_model(call("~", as.name(response_name), b), submodels, constants, response_name, cfg))
    user_fn <- model
    fn <- function(x) do.call(user_fn, as.list(x[args]))
    return(list(expr = NULL, text = paste0(response_name, " = f(", paste(args, collapse = ", "), ")"),
                response = response_name, factors = args, fn = fn, type = "black_box",
                constants = constants, pp = NULL, linear = NULL, groups = list(),
                grad = NULL))
  }
  # --- Строка / формула ---
  if (is.character(model)) {
    s <- trimws(paste(model, collapse = " "))
    s <- sub("^([^=<>!~]*[^=<>!~])\\s*=(?!=)", "\\1 ~", s, perl = TRUE)
    if (!grepl("~", s, fixed = TRUE)) s <- paste(response_name, "~", s)
    model <- tryCatch(eval(parse(text = s)[[1]]),
                      error = function(e) stop("Ошибка разбора модели '", s, "': ", conditionMessage(e)))
  }
  if (!inherits(model, "formula") && !(is.call(model) && identical(model[[1]], as.name("~"))))
    stop("Модель должна быть строкой 'Y = ...', формулой Y ~ ... или функцией.")
  if (length(model) == 3) {
    lhs <- paste(deparse(model[[2]]), collapse = ""); rhs <- model[[3]]
  } else { lhs <- response_name; rhs <- model[[2]] }
  lhs <- gsub("`", "", lhs)

  # Подстановка подмоделей (многоуровневая модель), рекурсивно
  if (length(submodels)) {
    subs <- lapply(submodels, function(z) {
      if (is.character(z)) { z <- parse(text = sub("^.*[=~]", "", z))[[1]] }
      if (inherits(z, "formula")) z <- z[[length(z)]]
      call("(", z)
    })
    for (i in seq_len(10)) {
      new <- do.call(substitute, list(rhs, subs))
      if (identical(new, rhs)) break
      rhs <- new
    }
  }
  vars <- all.vars(rhs)
  factors <- setdiff(vars, names(constants))
  if (!length(factors)) stop("В модели не найдено ни одного фактора.")
  env <- list2env(constants, parent = globalenv())
  fn <- function(x) eval(rhs, as.list(x), env)

  pp <- dfa_power_product(rhs, factors, constants)
  linear <- dfa_linear_coefs(rhs, factors, constants)
  type <- if (!is.null(linear)) "additive" else if (!is.null(pp) && all(pp$p > 0)) "multiplicative" else {
    top <- dfa_strip_parens(rhs)
    # снять множители-константы: 100 * a / b
    is_kr <- !is.null(pp)
    if (!is_kr && is.call(top) && as.character(top[[1]]) %in% c("*", "/")) {
      # кратная: числитель — произведение, знаменатель — сумма (y = a / (b + c))
      num_den <- dfa_split_ratio(top)
      if (!is.null(num_den)) {
        is_kr <- !is.null(dfa_power_product(num_den$num, intersect(all.vars(num_den$num), factors), constants)) &&
          !is.null(dfa_linear_coefs(num_den$den, intersect(all.vars(num_den$den), factors), constants))
      }
    }
    if (is_kr) "multiple" else "mixed"
  }
  grad <- dfa_make_gradient(rhs, factors, constants, env, cfg)
  list(expr = rhs, text = paste(lhs, "=", paste(deparse(rhs, width.cutoff = 500), collapse = " ")),
       response = lhs, factors = factors, fn = fn, type = type, constants = constants,
       pp = pp, linear = linear, groups = dfa_find_sum_groups(rhs, factors, constants),
       grad = grad, env = env)
}

# Модель вида c * Π x_i^p_i ?  -> list(c, p) или NULL
dfa_power_product <- function(e, factors, constants) {
  rec <- function(e) {
    if (is.numeric(e)) return(list(c = as.numeric(e), p = numeric(0)))
    if (is.name(e)) {
      nm <- as.character(e)
      if (nm %in% factors) return(list(c = 1, p = stats::setNames(1, nm)))
      if (nm %in% names(constants)) return(list(c = as.numeric(constants[[nm]]), p = numeric(0)))
      return(NULL)
    }
    if (!is.call(e)) return(NULL)
    op <- as.character(e[[1]])
    add_p <- function(p1, p2, s = 1) {
      for (n in names(p2)) p1[n] <- (if (n %in% names(p1)) p1[n] else 0) + s * p2[n]
      p1
    }
    if (op == "(") return(rec(e[[2]]))
    if (op == "-" && length(e) == 2) { r <- rec(e[[2]]); if (is.null(r)) return(NULL); r$c <- -r$c; return(r) }
    if (op == "+" && length(e) == 2) return(rec(e[[2]]))
    if (op %in% c("*", "/")) {
      a <- rec(e[[2]]); b <- rec(e[[3]])
      if (is.null(a) || is.null(b)) return(NULL)
      if (op == "*") return(list(c = a$c * b$c, p = add_p(a$p, b$p, 1)))
      return(list(c = a$c / b$c, p = add_p(a$p, b$p, -1)))
    }
    if (op == "^") {
      if (length(intersect(all.vars(e[[3]]), factors))) return(NULL)
      k <- tryCatch(eval(e[[3]], constants), error = function(err) NULL)
      a <- rec(e[[2]])
      if (is.null(a) || is.null(k) || !is.numeric(k) || length(k) != 1) return(NULL)
      return(list(c = a$c^k, p = a$p * k))
    }
    if (op == "sqrt") { a <- rec(e[[2]]); if (is.null(a)) return(NULL); return(list(c = sqrt(a$c), p = a$p / 2)) }
    NULL
  }
  r <- rec(e)
  if (is.null(r) || !length(r$p) || !all(factors %in% names(r$p))) return(NULL)
  r$p <- r$p[factors]
  if (any(r$p == 0)) return(NULL)
  r
}

# Линейная модель? -> вектор коэффициентов или NULL
dfa_linear_coefs <- function(e, factors, constants) {
  if (!length(factors)) return(NULL)
  co <- numeric(0)
  for (f in factors) {
    d <- tryCatch(stats::D(e, f), error = function(err) NULL)
    if (is.null(d) || length(intersect(all.vars(d), factors))) return(NULL)
    v <- tryCatch(eval(d, constants), error = function(err) NULL)
    if (is.null(v) || !is.numeric(v) || length(v) != 1) return(NULL)
    co[f] <- v
  }
  co
}

dfa_split_ratio <- function(e) {
  e <- dfa_strip_parens(e)
  if (!is.call(e)) return(NULL)
  op <- as.character(e[[1]])
  if (op == "/") return(list(num = e[[2]], den = e[[3]]))
  if (op == "*") {
    l <- dfa_split_ratio(e[[2]]); if (!is.null(l)) return(list(num = call("*", l$num, e[[3]]), den = l$den))
    r <- dfa_split_ratio(e[[3]]); if (!is.null(r)) return(list(num = call("*", e[[2]], r$num), den = r$den))
  }
  NULL
}

# Ищет суммы/разности факторов внутри модели: (b + c), (P - V) ...
dfa_find_sum_groups <- function(e, factors, constants) {
  groups <- list()
  rec <- function(e) {
    e <- dfa_strip_parens(e)
    if (!is.call(e)) return(invisible())
    op <- as.character(e[[1]])
    v <- intersect(all.vars(e), factors)
    if (op %in% c("+", "-") && length(e) == 3 && length(v) >= 2) {
      co <- dfa_linear_coefs(e, v, constants)
      if (!is.null(co)) { groups[[length(groups) + 1]] <<- list(vars = v, expr = e, coefs = co); return(invisible()) }
    }
    for (i in seq_along(e)[-1]) rec(e[[i]])
  }
  rec(e)
  # только непересекающиеся
  used <- character(0); out <- list()
  for (g in groups) if (!length(intersect(g$vars, used))) { out[[length(out) + 1]] <- g; used <- c(used, g$vars) }
  out
}

# Градиент: аналитический (deriv) или численный
dfa_make_gradient <- function(e, factors, constants, env, cfg) {
  h_rel <- cfg$numeric_deriv_h %||% 1e-6
  num_grad <- function(x) {
    fn <- function(z) eval(e, as.list(z), env)
    g <- numeric(length(factors)); names(g) <- factors
    for (f in factors) {
      h <- h_rel * max(abs(x[f]), 1)
      xp <- x; xm <- x; xp[f] <- x[f] + h; xm[f] <- x[f] - h
      g[f] <- (fn(xp) - fn(xm)) / (2 * h)
    }
    g
  }
  if (!isTRUE(cfg$use_symbolic_deriv %||% TRUE)) return(list(fun = num_grad, type = "численный"))
  sym <- tryCatch({
    d <- stats::deriv(e, factors, function.arg = factors)
    environment(d) <- env
    d
  }, error = function(err) NULL)
  if (is.null(sym)) return(list(fun = num_grad, type = "численный (центральные разности)"))
  list(fun = function(x) {
    g <- attr(do.call(sym, as.list(x[factors])), "gradient")
    g <- as.numeric(g); names(g) <- factors
    if (any(!is.finite(g))) num_grad(x) else g
  }, type = "аналитический (символьное дифференцирование)")
}

dfa_resolve_order <- function(mdl, cfg) {
  f <- mdl$factors
  o <- cfg$order %||% "model"
  if (length(o) == 1 && o == "model") return(f)
  if (length(o) == 1 && o == "auto") {
    ty <- cfg$factor_types
    rank <- ifelse(f %in% names(ty) & ty[f] %in% c("qualitative", "качественный"), 2,
                   ifelse(f %in% names(ty) & ty[f] %in% c("structural", "структурный"), 1.5, 1))
    return(f[order(rank, seq_along(f))])
  }
  miss <- setdiff(f, o); extra <- setdiff(o, f)
  if (length(extra)) stop("В порядке подстановки есть лишние факторы: ", paste(extra, collapse = ", "))
  if (length(miss)) { warning("Факторы добавлены в конец порядка: ", paste(miss, collapse = ", ")); o <- c(o, miss) }
  o
}


# =============================================================================
# 6. МЕТОДЫ ЭЛИМИНИРОВАНИЯ
#    Каждый метод принимает (mdl, x0, x1, ord, cfg) и возвращает
#    list(effects = <именованный вектор>, details = ..., note = ...)
#    или list(effects = NULL, note = "почему неприменим")
# =============================================================================

# ---- 6.1 Цепных подстановок --------------------------------------------------
dfa_chain <- function(mdl, x0, x1, ord, cfg) {
  x <- x0; prev <- mdl$fn(x); y0 <- prev
  eff <- stats::setNames(numeric(length(ord)), ord)
  steps <- data.frame(step = 0, substituted = "—", y = y0, stringsAsFactors = FALSE)
  for (i in seq_along(ord)) {
    f <- ord[i]; x[f] <- x1[f]
    cur <- mdl$fn(x)
    eff[f] <- cur - prev
    steps <- rbind(steps, data.frame(step = i, substituted = f, y = cur, stringsAsFactors = FALSE))
    prev <- cur
  }
  steps$name <- c("Y0 (базисный)", paste0("Y усл.", seq_len(length(ord) - 1)), "Y1 (отчётный)")[seq_len(nrow(steps))]
  steps$formula <- vapply(0:length(ord), function(i)
    paste(vapply(mdl$factors, function(f) paste0(f, if (f %in% ord[seq_len(i)]) "1" else "0"),
                 character(1)), collapse = ", "), character(1))
  list(effects = eff[mdl$factors], details = steps,
       note = paste("Порядок подстановки:", paste(ord, collapse = " → ")))
}

# ---- 6.2 Абсолютных разниц ---------------------------------------------------
dfa_abs_diff <- function(mdl, x0, x1, ord, cfg) {
  if (!identical(mdl$type, "multiplicative") || any(abs(mdl$pp$p - 1) > 1e-12))
    return(list(effects = NULL, note = paste(
      "Применим к мультипликативным моделям Y = a·b·c... Для других моделей",
      "расчёт в разностях совпадает с цепными подстановками — используйте chain.")))
  c0 <- mdl$pp$c
  eff <- stats::setNames(numeric(length(ord)), ord)
  txt <- character(0)
  for (i in seq_along(ord)) {
    before <- ord[seq_len(i - 1)]; after <- ord[-seq_len(i)]
    eff[ord[i]] <- c0 * prod(x1[before]) * (x1[ord[i]] - x0[ord[i]]) * prod(x0[after])
    sfx <- function(v, s) if (length(v)) paste0(v, s) else character(0)
    txt[ord[i]] <- paste0("ΔY(", ord[i], ") = ",
      paste(c(if (c0 != 1) format(c0), sfx(before, "1"), paste0("Δ", ord[i]), sfx(after, "0")),
            collapse = " × "))
  }
  list(effects = eff[mdl$factors], details = data.frame(factor = ord, formula = txt[ord],
       effect = eff[ord], stringsAsFactors = FALSE), note = "Формулы: см. details")
}

# ---- 6.3 Относительных разниц ------------------------------------------------
dfa_rel_diff <- function(mdl, x0, x1, ord, cfg) {
  if (!identical(mdl$type, "multiplicative") || any(abs(mdl$pp$p - 1) > 1e-12))
    return(list(effects = NULL, note = "Применим только к мультипликативным моделям Y = a·b·c..."))
  if (any(x0 == 0)) return(list(effects = NULL, note = "Нулевые базисные значения факторов — относительные отклонения не определены."))
  y0 <- mdl$fn(x0)
  eff <- stats::setNames(numeric(length(ord)), ord)
  d <- data.frame(factor = ord, delta_pct = NA_real_, base_for_calc = NA_real_, effect = NA_real_)
  acc <- y0
  for (i in seq_along(ord)) {
    f <- ord[i]
    dp <- (x1[f] - x0[f]) / x0[f] * 100
    eff[f] <- acc * dp / 100
    d[i, 2:4] <- c(dp, acc, eff[f])
    acc <- acc + eff[f]
  }
  list(effects = eff[mdl$factors], details = d,
       note = "ΔY(x_i) = (Y0 + Σ ΔY предыдущих) × Δx_i% / 100")
}

# ---- 6.4 Индексный ---------------------------------------------------------
dfa_index <- function(mdl, x0, x1, ord, cfg) {
  if (is.null(mdl$pp))
    return(list(effects = NULL, note = "Применим к мультипликативным и кратным моделям вида Y = c·Π x^p."))
  if (any(x0 == 0)) return(list(effects = NULL, note = "Нулевые базисные значения — индексы не определены."))
  I <- x1 / x0
  p <- mdl$pp$p
  Ip <- I^p
  if (any(!is.finite(Ip))) return(list(effects = NULL, note = "Индексы в степени не определены (отрицательные значения при дробной степени)."))
  y0 <- mdl$fn(x0); y1 <- mdl$fn(x1)
  eff <- stats::setNames(numeric(length(ord)), ord)
  cum <- 1
  for (f in ord) { eff[f] <- y0 * cum * (Ip[f] - 1); cum <- cum * Ip[f] }
  d <- data.frame(factor = mdl$factors, index = I[mdl$factors], power = p[mdl$factors],
                  index_contrib = Ip[mdl$factors], effect = eff[mdl$factors])
  list(effects = eff[mdl$factors], details = d,
       note = paste0("I(Y) = Π I(x)^p = ", format(prod(Ip), digits = 6),
                     " (факт: ", format(dfa_safe_div(y1, y0), digits = 6), ")"))
}

# ---- 6.5 Интегральный ------------------------------------------------------
# ΔY_i = ∫_0^1 ∂f/∂x_i (x0 + tΔx) Δx_i dt — квадратура Гаусса—Лежандра.
# Для полиномиальных моделей результат точен; неразложимого остатка нет.
dfa_integral <- function(mdl, x0, x1, ord, cfg) {
  if (is.null(mdl$grad)) return(list(effects = NULL, note = "Модель задана функцией-чёрным ящиком без выражения — используйте shapley/chain."))
  gl <- dfa_gauss_legendre(cfg$integral_nodes %||% 32)
  dx <- x1 - x0
  acc <- stats::setNames(numeric(length(mdl$factors)), mdl$factors)
  for (q in seq_along(gl$t)) {
    g <- mdl$grad$fun(x0 + gl$t[q] * dx)
    if (any(!is.finite(g))) return(list(effects = NULL, note = "Производная не определена на пути интегрирования (деление на 0 / log отриц. и т.п.)."))
    acc <- acc + gl$w[q] * g[mdl$factors]
  }
  eff <- acc * dx[mdl$factors]
  list(effects = eff, details = NULL,
       note = paste0("Производные: ", mdl$grad$type, "; узлов квадратуры: ", length(gl$t)))
}

# ---- 6.6 Логарифмический ---------------------------------------------------
dfa_log <- function(mdl, x0, x1, ord, cfg) {
  if (is.null(mdl$pp)) return(list(effects = NULL, note = "Применим к мультипликативным и кратным моделям вида Y = c·Π x^p."))
  I <- x1 / x0
  y0 <- mdl$fn(x0); y1 <- mdl$fn(x1)
  if (any(!is.finite(I)) || any(I <= 0)) return(list(effects = NULL, note = "Нужны индексы факторов > 0 (одинаковые знаки базы и отчёта, без нулей)."))
  Iy <- y1 / y0
  if (!is.finite(Iy) || Iy <= 0) return(list(effects = NULL, note = "Индекс результата должен быть > 0."))
  dy <- y1 - y0
  if (abs(log(Iy)) < 1e-12) {
    if (all(abs(log(I)) < 1e-12)) return(list(effects = stats::setNames(rep(0, length(I)), names(I))[mdl$factors], note = "Изменений нет."))
    return(list(effects = NULL, note = "I(Y) = 1 при изменившихся факторах — деление на ln(1) = 0, метод неприменим."))
  }
  eff <- dy * mdl$pp$p * log(I[mdl$factors]) / log(Iy)
  list(effects = eff[mdl$factors], details = data.frame(factor = mdl$factors, ln_index = log(I[mdl$factors]),
       power = mdl$pp$p, share = mdl$pp$p * log(I[mdl$factors]) / log(Iy)),
       note = "ΔY(x_i) = ΔY × p_i·ln I(x_i) / ln I(Y)")
}

# ---- 6.7 Шепли / взвешенных конечных разностей ------------------------------
dfa_shapley <- function(mdl, x0, x1, ord, cfg) {
  f <- mdl$factors; k <- length(f)
  if (k > (cfg$max_shapley_factors %||% 16))
    return(list(effects = NULL, note = paste0("Слишком много факторов (", k, ") для точного расчёта 2^k.")))
  n <- 2^k
  vals <- numeric(n)
  for (m in 0:(n - 1)) {
    bits <- bitwAnd(m, 2^(0:(k - 1))) > 0
    x <- x0; x[f[bits]] <- x1[f[bits]]
    vals[m + 1] <- mdl$fn(x)
  }
  w <- factorial(0:(k - 1)) * factorial((k - 1):0) / factorial(k)
  eff <- stats::setNames(numeric(k), f)
  for (i in seq_len(k)) {
    bi <- 2^(i - 1)
    for (m in 0:(n - 1)) if (bitwAnd(m, bi) == 0) {
      s <- sum(bitwAnd(m, 2^(0:(k - 1))) > 0)
      eff[i] <- eff[i] + w[s + 1] * (vals[m + bi + 1] - vals[m + 1])
    }
  }
  list(effects = eff, details = NULL,
       note = paste0("Среднее по всем ", factorial(k), " порядкам подстановки; от порядка не зависит."))
}

# ---- 6.8 Пропорционального деления (долевого участия) -----------------------
dfa_proportional <- function(mdl, x0, x1, ord, cfg) {
  if (is.null(mdl$expr)) return(list(effects = NULL, note = "Нужна модель-выражение."))
  groups <- mdl$groups
  if (!is.null(cfg$proportional_groups)) {
    groups <- lapply(names(cfg$proportional_groups) %||% seq_along(cfg$proportional_groups), function(nm) {
      v <- cfg$proportional_groups[[nm]]
      list(vars = v, name = nm, coefs = NULL)
    })
  }
  if (identical(mdl$type, "additive"))
    groups <- list(list(vars = mdl$factors, coefs = mdl$linear, name = "Вся модель"))
  if (!length(groups)) return(list(effects = NULL, note = "В модели нет сумм факторов (b + c ...), делить пропорционально нечего."))
  # единицы подстановки: группа меняется целиком, остальные — по одному
  units <- list(); used <- character(0)
  for (f in ord) {
    if (f %in% used) next
    gi <- which(vapply(groups, function(g) f %in% g$vars, logical(1)))
    if (length(gi)) { units[[length(units) + 1]] <- list(vars = groups[[gi[1]]]$vars, g = groups[[gi[1]]]); used <- c(used, groups[[gi[1]]]$vars) }
    else { units[[length(units) + 1]] <- list(vars = f, g = NULL); used <- c(used, f) }
  }
  x <- x0; prev <- mdl$fn(x)
  eff <- stats::setNames(numeric(length(mdl$factors)), mdl$factors)
  det <- NULL
  for (u in units) {
    x[u$vars] <- x1[u$vars]; cur <- mdl$fn(x); ue <- cur - prev; prev <- cur
    if (is.null(u$g)) { eff[u$vars] <- ue; next }
    co <- u$g$coefs
    if (is.null(co)) {  # коэффициенты при факторах группы из градиента в середине пути
      g <- mdl$grad$fun((x0 + x1) / 2)[u$vars]
      co <- g / max(abs(g))
    }
    wts <- (x1[u$vars] - x0[u$vars]) * co[u$vars]
    dL <- sum(wts)
    if (abs(dL) > 1e-12 * max(abs(wts), 1e-300)) {
      sh <- wts / dL
      eff[u$vars] <- ue * sh
    } else {
      # изменения слагаемых взаимно погасились (ΔL = 0): предел ΔY/ΔL = ∂Y/∂L
      g <- mdl$grad$fun(x)[u$vars]; j <- which.max(abs(co[u$vars]))
      dYdL <- g[j] / co[u$vars][j]
      sh <- rep(NA_real_, length(wts))
      eff[u$vars] <- dYdL * wts
    }
    glab <- if (!is.null(u$g$expr)) paste(deparse(u$g$expr), collapse = "") else paste(u$vars, collapse = " + ")
    det <- rbind(det, data.frame(group = glab, factor = u$vars,
                                 group_effect = ue, weight = wts, share = sh, effect = eff[u$vars]))
  }
  list(effects = eff, details = det,
       note = "Влияние суммы распределено пропорционально абсолютным изменениям её слагаемых.")
}

dfa_methods_registry <- list(chain = dfa_chain, abs_diff = dfa_abs_diff, rel_diff = dfa_rel_diff,
                             index = dfa_index, integral = dfa_integral, log = dfa_log,
                             shapley = dfa_shapley, proportional = dfa_proportional)

# ---- Чувствительность к порядку подстановки ---------------------------------
dfa_all_orders <- function(mdl, x0, x1, cfg) {
  f <- mdl$factors; k <- length(f)
  if (k > (cfg$max_full_orders %||% 8)) {
    set.seed(cfg$seed %||% 42)
    perms <- t(replicate(cfg$n_random_orders %||% 5000, sample(f)))
    full <- FALSE
  } else { perms <- dfa_permutations(f); full <- TRUE }
  m <- t(apply(perms, 1, function(o) dfa_chain(mdl, x0, x1, o, cfg)$effects))
  if (k == 1) m <- matrix(m, ncol = 1)
  colnames(m) <- f
  list(matrix = m, orders = apply(perms, 1, paste, collapse = "→"), full = full,
       summary = data.frame(factor = f, min = apply(m, 2, min), max = apply(m, 2, max),
                            mean = colMeans(m), sd = if (nrow(m) > 1) apply(m, 2, stats::sd) else 0,
                            range = apply(m, 2, function(v) diff(range(v))),
                            sign_changes = apply(m, 2, function(v) any(v > 0) && any(v < 0)),
                            stringsAsFactors = FALSE))
}

# ---- Эластичности и торнадо ---------------------------------------------------
dfa_sensitivity <- function(mdl, x0, x1, cfg) {
  xp <- if (identical(cfg$sensitivity_point, "report")) x1 else x0
  y <- mdl$fn(xp)
  g <- if (!is.null(mdl$grad)) mdl$grad$fun(xp) else {
    vapply(mdl$factors, function(f) { h <- 1e-6 * max(abs(xp[f]), 1); a <- xp; b <- xp
      a[f] <- a[f] + h; b[f] <- b[f] - h; (mdl$fn(a) - mdl$fn(b)) / (2 * h) }, numeric(1))
  }
  el <- dfa_safe_div(g * xp[mdl$factors], y)
  d <- (cfg$tornado_pct %||% 10) / 100
  tor <- t(vapply(mdl$factors, function(f) {
    lo <- xp; hi <- xp; lo[f] <- xp[f] * (1 - d); hi[f] <- xp[f] * (1 + d)
    c(low = mdl$fn(lo) - y, high = mdl$fn(hi) - y)
  }, numeric(2)))
  data.frame(factor = mdl$factors, value = xp[mdl$factors], derivative = g[mdl$factors],
             elasticity = el, tornado_low = tor[, "low"], tornado_high = tor[, "high"],
             stringsAsFactors = FALSE)
}


# =============================================================================
# 7. АНАЛИЗ ОДНОЙ ПАРЫ (база → отчёт)
# =============================================================================
dfa_analyze_pair <- function(mdl, x0, x1, cfg, base_name = "База", report_name = "Отчёт",
                             y0_data = NULL, y1_data = NULL, group = NULL) {
  f <- mdl$factors
  x0 <- stats::setNames(as.numeric(x0[f]), f); x1 <- stats::setNames(as.numeric(x1[f]), f)
  ord <- dfa_resolve_order(mdl, cfg)
  y0 <- mdl$fn(x0); y1 <- mdl$fn(x1)
  if (!is.finite(y0) || !is.finite(y1))
    stop("Модель не вычисляется на данных (", base_name, "→", report_name, "): Y0 = ", y0, ", Y1 = ", y1,
         ". Проверьте нули в знаменателе, log отрицательных чисел и т.п.")
  checks <- NULL
  if (!is.null(y0_data)) {
    rel <- function(a, b) abs(a - b) / max(abs(b), 1e-12)
    checks <- data.frame(period = c(base_name, report_name), y_data = c(y0_data, y1_data),
                         y_model = c(y0, y1), diff = c(y0 - y0_data, y1 - y1_data),
                         ok = c(rel(y0, y0_data), rel(y1, y1_data)) <= (cfg$check_tolerance %||% 1e-6))
    if (identical(cfg$y_source, "data")) { y0 <- y0_data; y1 <- y1_data }
  }
  dy <- y1 - y0
  methods <- intersect(cfg$methods, names(dfa_methods_registry))
  res <- lapply(methods, function(m) {
    out <- tryCatch(dfa_methods_registry[[m]](mdl, x0, x1, ord, cfg),
                    error = function(e) list(effects = NULL, note = paste("Ошибка:", conditionMessage(e))))
    if (!is.null(out$effects) && any(!is.finite(out$effects)))
      out <- list(effects = NULL, note = paste("Получены нечисловые значения.", out$note %||% ""))
    out
  })
  names(res) <- methods
  ok_m <- methods[vapply(res, function(r) !is.null(r$effects), logical(1))]

  eff <- if (length(ok_m)) do.call(cbind, lapply(res[ok_m], `[[`, "effects")) else matrix(nrow = length(f), ncol = 0)
  if (length(ok_m)) { eff <- matrix(eff, nrow = length(f), dimnames = list(f, ok_m)) }
  balance <- data.frame(method = ok_m, method_name = DFA_METHOD_NAMES[ok_m],
                        sum_effects = colSums(eff), delta_y = dy,
                        residual = dy - colSums(eff),
                        stringsAsFactors = FALSE)
  balance$ok <- abs(balance$residual) <= 1e-6 * max(abs(dy), abs(y0), 1)

  lab <- dfa_labels(f, cfg)
  tab <- data.frame(factor = f, label = lab, base = x0, report = x1,
                    abs_change = x1 - x0,
                    growth_pct = dfa_safe_div(x1 - x0, abs(x0)) * 100,
                    index = dfa_safe_div(x1, x0), stringsAsFactors = FALSE)
  for (m in ok_m) {
    tab[[paste0("eff_", m)]] <- eff[, m]
    tab[[paste0("share_", m)]] <- dfa_safe_div(eff[, m], dy) * 100
  }
  main <- if (cfg$main_method %in% ok_m) cfg$main_method else ok_m[1]
  if (!identical(main, cfg$main_method) && length(ok_m))
    warning("Основной метод '", cfg$main_method, "' неприменим — используется '", main, "'")
  if (!is.null(main)) tab$rank <- rank(-abs(tab[[paste0("eff_", main)]]), ties.method = "first")
  orders <- if (isTRUE(cfg$all_orders) && length(f) > 1) dfa_all_orders(mdl, x0, x1, cfg) else NULL
  sens <- if (isTRUE(cfg$sensitivity)) tryCatch(dfa_sensitivity(mdl, x0, x1, cfg), error = function(e) NULL) else NULL

  structure(list(model = mdl, group = group, base_name = base_name, report_name = report_name,
                 x0 = x0, x1 = x1, y0 = y0, y1 = y1, dy = dy,
                 dy_pct = dfa_safe_div(dy, abs(y0)) * 100, iy = dfa_safe_div(y1, y0),
                 order = ord, methods = res, ok_methods = ok_m, main_method = main,
                 effects = eff, table = tab, balance = balance, orders = orders,
                 sensitivity = sens, checks = checks), class = "dfa_pair")
}

dfa_labels <- function(f, cfg) {
  l <- cfg$factor_labels
  out <- f
  if (length(l)) { hit <- f %in% names(l); out[hit] <- unname(l[f[hit]]) }
  out
}


# =============================================================================
# 8. ТЕКСТОВЫЕ ВЫВОДЫ
# =============================================================================
dfa_conclusions <- function(r, cfg) {
  if (is.null(r$main_method)) return("Ни один метод не применим к данной модели/данным.")
  e <- r$effects[, r$main_method]
  lab <- dfa_labels(names(e), cfg)
  ylab <- cfg$response_label %||% r$model$response
  txt <- character(0)
  dir <- if (r$dy > 0) "увеличился" else if (r$dy < 0) "уменьшился" else "не изменился"
  txt <- c(txt, sprintf("Показатель «%s» %s с %s до %s, т.е. на %s (%s).",
    ylab, dir, dfa_fmt(r$y0, cfg$digits, cfg), dfa_fmt(r$y1, cfg$digits, cfg),
    dfa_fmt(r$dy, cfg$digits, cfg, TRUE), dfa_pct(r$dy_pct, cfg, TRUE)))
  txt <- c(txt, sprintf("Разложение выполнено методом: %s.", DFA_METHOD_NAMES[r$main_method]))
  o <- order(-e)
  pos <- o[e[o] > 0]; neg <- rev(o[e[o] < 0])
  if (length(pos)) txt <- c(txt, "Положительное влияние оказали:",
    sprintf("  • %s: %s (%s общего изменения)", lab[pos], dfa_fmt(e[pos], cfg$digits, cfg, TRUE),
            dfa_pct(dfa_safe_div(e[pos], r$dy) * 100, cfg)))
  if (length(neg)) txt <- c(txt, "Отрицательное влияние оказали:",
    sprintf("  • %s: %s (%s общего изменения)", lab[neg], dfa_fmt(e[neg], cfg$digits, cfg, TRUE),
            dfa_pct(dfa_safe_div(e[neg], r$dy) * 100, cfg)))
  zero <- which(e == 0)
  if (length(zero)) txt <- c(txt, paste0("Не повлияли (не изменились): ", paste(lab[zero], collapse = ", "), "."))
  top <- which.max(abs(e))
  txt <- c(txt, sprintf("Определяющий фактор: «%s» (%s).", lab[top], dfa_fmt(e[top], cfg$digits, cfg, TRUE)))
  if (!is.null(r$orders)) {
    s <- r$orders$summary
    sc <- s$factor[s$sign_changes]
    rng <- max(s$range) / max(abs(r$dy), 1e-12) * 100
    txt <- c(txt, sprintf("Зависимость от порядка подстановки: максимальный разброс влияния фактора — %s от ΔY.",
                          dfa_pct(rng, cfg)))
    if (length(sc)) txt <- c(txt, paste0("ВНИМАНИЕ: знак влияния зависит от порядка подстановки для: ",
                                         paste(dfa_labels(sc, cfg), collapse = ", "),
                                         ". Для таких факторов опирайтесь на интегральный метод или Шепли."))
    else if (rng > 5 && r$main_method %in% c("chain", "abs_diff", "rel_diff", "index"))
      txt <- c(txt, "Результаты заметно зависят от порядка подстановки — сверьтесь с интегральным методом / Шепли.")
  }
  bad <- r$balance$method_name[!r$balance$ok]
  if (length(bad)) txt <- c(txt, paste("Баланс не сошёлся для методов:", paste(bad, collapse = ", ")))
  else txt <- c(txt, "Проверка баланса: сумма влияний факторов равна общему изменению для всех методов.")
  txt
}


# =============================================================================
# 9. ПЕЧАТЬ И СОХРАНЕНИЕ
# =============================================================================
dfa_format_table <- function(tab, cfg) {
  out <- tab
  for (nm in names(out)) if (is.numeric(out[[nm]])) {
    out[[nm]] <- if (grepl("^(share_|growth_pct)", nm)) dfa_pct(out[[nm]], cfg)
                 else if (nm == "index") dfa_fmt(out[[nm]], 4, cfg)
                 else if (nm == "rank") as.character(out[[nm]])
                 else dfa_fmt(out[[nm]], cfg$digits, cfg)
  }
  nice <- c(factor = "Фактор", label = "Наименование", base = "База", report = "Отчёт",
            abs_change = "Абс. изм.", growth_pct = "Темп прироста", index = "Индекс", rank = "Ранг")
  for (m in names(DFA_METHOD_SHORT)) {
    nice[paste0("eff_", m)] <- paste0("ΔY: ", DFA_METHOD_SHORT[m])
    nice[paste0("share_", m)] <- paste0("Доля: ", DFA_METHOD_SHORT[m])
  }
  names(out) <- ifelse(names(out) %in% names(nice), nice[names(out)], names(out))
  rownames(out) <- NULL
  out
}

dfa_pair_report <- function(r, cfg) {
  owidth <- options(width = 250); on.exit(options(owidth))
  L <- character(0); add <- function(...) L <<- c(L, ...)
  hdr <- paste0(if (!is.null(r$group)) paste0("[", r$group, "] ") else "", r$base_name, " → ", r$report_name)
  add(strrep("=", 78), paste0(" ", hdr), strrep("=", 78))
  add(paste("Модель:", r$model$text), paste("Тип модели:", DFA_MODEL_TYPES[r$model$type]),
      paste("Факторы:", paste(sprintf("%s (%s)", r$model$factors, dfa_labels(r$model$factors, cfg)), collapse = "; ")),
      paste("Порядок подстановки:", paste(r$order, collapse = " → ")), "")
  add(sprintf("Y0 = %s;  Y1 = %s;  ΔY = %s;  Темп прироста = %s;  I(Y) = %s",
              dfa_fmt(r$y0, cfg$digits, cfg), dfa_fmt(r$y1, cfg$digits, cfg),
              dfa_fmt(r$dy, cfg$digits, cfg, TRUE), dfa_pct(r$dy_pct, cfg, TRUE), dfa_fmt(r$iy, 4, cfg)), "")
  if (!is.null(r$checks)) {
    add("Сверка модели с фактическими значениями результата в данных:")
    add(utils::capture.output(print(r$checks, row.names = FALSE)), "")
  }
  add("1) Исходные данные и динамика факторов:")
  t1 <- dfa_format_table(r$table[, c("factor", "label", "base", "report", "abs_change", "growth_pct", "index")], cfg)
  add(utils::capture.output(print(t1, row.names = FALSE, right = FALSE)), "")
  add("2) Влияние факторов по методам (ΔY):")
  cols <- c("factor", paste0("eff_", r$ok_methods))
  add(utils::capture.output(print(dfa_format_table(r$table[, cols], cfg), row.names = FALSE)), "")
  add("3) Доля влияния факторов в общем изменении, %:")
  cols <- c("factor", paste0("share_", r$ok_methods))
  add(utils::capture.output(print(dfa_format_table(r$table[, cols], cfg), row.names = FALSE)), "")
  add("4) Проверка баланса (Σ влияний = ΔY):")
  b <- r$balance; b$sum_effects <- dfa_fmt(b$sum_effects, 6, cfg); b$delta_y <- dfa_fmt(b$delta_y, 6, cfg)
  b$residual <- format(r$balance$residual, digits = 3); b$ok <- ifelse(b$ok, "OK", "НЕ СХОДИТСЯ")
  names(b) <- c("Метод", "Название", "Σ влияний", "ΔY", "Остаток", "Статус")
  add(utils::capture.output(print(b, row.names = FALSE, right = FALSE)), "")
  na <- setdiff(intersect(cfg$methods, names(r$methods)), r$ok_methods)
  if (length(na)) {
    add("Неприменимые методы:")
    add(sprintf("  • %s: %s", DFA_METHOD_NAMES[na], vapply(r$methods[na], function(z) z$note %||% "", character(1))), "")
  }
  add("Примечания по методам:")
  add(sprintf("  • %s: %s", DFA_METHOD_NAMES[r$ok_methods],
              vapply(r$methods[r$ok_methods], function(z) z$note %||% "", character(1))), "")
  if ("chain" %in% r$ok_methods) {
    add("5) Цепные подстановки — условные показатели:")
    st <- r$methods$chain$details
    st2 <- data.frame("Шаг" = st$step, "Показатель" = st$name, "Факторы" = st$formula,
                      "Подставлен" = st$substituted, "Значение" = dfa_fmt(st$y, cfg$digits, cfg),
                      "Влияние" = c("—", dfa_fmt(diff(st$y), cfg$digits, cfg, TRUE)))
    add(utils::capture.output(print(st2, row.names = FALSE, right = FALSE)), "")
  }
  if ("abs_diff" %in% r$ok_methods) {
    add("6) Метод абсолютных разниц — формулы:")
    add(paste0("  ", r$methods$abs_diff$details$formula, " = ",
               dfa_fmt(r$methods$abs_diff$details$effect, cfg$digits, cfg, TRUE)), "")
  }
  if ("proportional" %in% r$ok_methods && !is.null(r$methods$proportional$details)) {
    add("7) Пропорциональное деление — распределение влияния сумм:")
    d <- r$methods$proportional$details
    d$group_effect <- dfa_fmt(d$group_effect, cfg$digits, cfg, TRUE); d$weight <- dfa_fmt(d$weight, cfg$digits, cfg)
    d$share <- dfa_pct(r$methods$proportional$details$share * 100, cfg); d$effect <- dfa_fmt(d$effect, cfg$digits, cfg, TRUE)
    names(d) <- c("Сумма", "Фактор", "Влияние суммы", "Вклад в Δ суммы", "Доля", "Влияние")
    add(utils::capture.output(print(d, row.names = FALSE, right = FALSE)), "")
  }
  if (!is.null(r$orders)) {
    add(sprintf("8) Чувствительность к порядку подстановки (%s перестановок%s):",
                nrow(r$orders$matrix), if (r$orders$full) ", все" else ", случайная выборка"))
    s <- r$orders$summary
    s2 <- data.frame("Фактор" = s$factor, "Мин" = dfa_fmt(s$min, cfg$digits, cfg), "Макс" = dfa_fmt(s$max, cfg$digits, cfg),
                     "Среднее" = dfa_fmt(s$mean, cfg$digits, cfg), "Размах" = dfa_fmt(s$range, cfg$digits, cfg),
                     `Смена знака` = ifelse(s$sign_changes, "ДА", "нет"), check.names = FALSE)
    add(utils::capture.output(print(s2, row.names = FALSE, right = FALSE)), "")
  }
  if (!is.null(r$sensitivity)) {
    s <- r$sensitivity
    add(sprintf("9) Эластичности и сценарии ±%s%% (точка: %s):", cfg$tornado_pct,
                if (identical(cfg$sensitivity_point, "report")) r$report_name else r$base_name))
    s2 <- data.frame("Фактор" = s$factor, "Значение" = dfa_fmt(s$value, cfg$digits, cfg),
                     `∂Y/∂x` = dfa_fmt(s$derivative, 4, cfg), "Эластичность" = dfa_fmt(s$elasticity, 4, cfg),
                     `ΔY при -` = dfa_fmt(s$tornado_low, cfg$digits, cfg, TRUE),
                     `ΔY при +` = dfa_fmt(s$tornado_high, cfg$digits, cfg, TRUE), check.names = FALSE)
    add(utils::capture.output(print(s2, row.names = FALSE, right = FALSE)),
        "  Эластичность: на сколько % изменится Y при изменении фактора на 1%.", "")
  }
  add("ВЫВОДЫ:", paste0("  ", dfa_conclusions(r, cfg)), "")
  L
}

dfa_write_csv <- function(df, path, cfg) {
  con <- file(path, open = "w", encoding = "UTF-8")
  on.exit(close(con))
  cat("﻿", file = con)  # BOM — чтобы Excel корректно открыл кириллицу
  utils::write.table(df, con, sep = cfg$csv_sep %||% ";", dec = cfg$csv_dec %||% ",",
                     row.names = FALSE, na = "")
}


# =============================================================================
# 10. ГРАФИКИ (base R)
# =============================================================================
dfa_alpha <- function(col, a) grDevices::adjustcolor(col, alpha.f = a)

dfa_ylab_fmt <- function(cfg) function(v) dfa_fmt(v, if (max(abs(v), na.rm = TRUE) >= 100) 0 else cfg$digits, cfg)

# Перенос подписей оси X по доступной ширине одного столбца (в дюймах)
dfa_fit_labels <- function(labels, n, cex = 0.72, side_in = 1.4) {
  slot <- max((graphics::par("fin")[1] - side_in) / max(n, 1), 0.3)
  ch <- graphics::strwidth("м", units = "inches", cex = cex)
  width <- max(6, floor(slot * 0.95 / ch))
  vapply(labels, function(s) paste(unlist(lapply(strsplit(s, "\n")[[1]], strwrap, width = width)),
                                   collapse = "\n"), character(1), USE.NAMES = FALSE)
}

dfa_left_margin <- function(labels, cex = 0.9, min_in = 0.8) {
  w <- max(graphics::strwidth(labels, units = "inches", cex = cex), 0)
  max(min_in, w + 0.3)
}

dfa_grid_h <- function(cfg) graphics::abline(h = pretty(graphics::par("usr")[3:4]), col = cfg$colors$grid, lwd = 1)
dfa_grid_v <- function(cfg) graphics::abline(v = pretty(graphics::par("usr")[1:2]), col = cfg$colors$grid, lwd = 1)

dfa_subtitle <- function(r, cfg)
  paste0(if (!is.null(r$group)) paste0(r$group, ": ") else "", r$base_name, " → ", r$report_name,
         "  |  ", DFA_METHOD_NAMES[r$main_method])

# ---- Каскадная диаграмма (водопад) --------------------------------------------
dfa_plot_waterfall <- function(r, cfg, method = r$main_method) {
  e <- r$effects[, method]
  n <- length(e) + 2
  lab <- dfa_fit_labels(c(paste0(cfg$response_label %||% r$model$response, "\n", r$base_name),
                          dfa_labels(names(e), cfg),
                          paste0(cfg$response_label %||% r$model$response, "\n", r$report_name)),
                        n, 0.72 * cfg$base_font)
  lv <- c(r$y0, r$y0 + cumsum(e))
  from0 <- cfg$waterfall_from_zero
  if (identical(from0, "auto")) {
    span <- diff(range(lv)); from0 <- span > 0.35 * max(abs(lv)) || any(lv <= 0)
  }
  yr <- range(lv, if (isTRUE(from0)) 0)
  pad <- diff(yr) * 0.12; if (pad == 0) pad <- max(abs(yr), 1) * 0.1
  ylim <- c(yr[1] - if (isTRUE(from0) && yr[1] >= 0) 0 else pad, yr[2] + pad)
  base_y <- if (isTRUE(from0)) 0 else ylim[1]
  bm <- max(1.2, max(sapply(strsplit(lab, "\n"), length)) * 0.2 + 0.4)
  op <- graphics::par(mai = c(bm, 1.1, 0.9, 0.3)); on.exit(graphics::par(op))
  graphics::plot(NA, xlim = c(0.4, n + 0.6), ylim = ylim, xaxt = "n", yaxt = "n", xlab = "", ylab = "",
                 main = paste("Каскадная диаграмма влияния факторов\n", dfa_subtitle(r, cfg)),
                 cex.main = 0.95 * cfg$base_font, bty = "n")
  dfa_grid_h(cfg)
  at <- pretty(ylim); graphics::axis(2, at = at, labels = dfa_ylab_fmt(cfg)(at), las = 1, cex.axis = 0.8)
  w <- 0.36
  bars <- rbind(c(base_y, r$y0), cbind(lv[-length(lv)], lv[-1]), c(base_y, r$y1))
  cols <- c(cfg$colors$total, ifelse(e >= 0, cfg$colors$positive, cfg$colors$negative), cfg$colors$total)
  for (i in seq_len(n)) {
    graphics::rect(i - w, min(bars[i, ]), i + w, max(bars[i, ]), col = cols[i], border = NA)
    if (i < n) graphics::segments(i + w, lv[i], i + 1 - w, lv[i], lty = 3, col = cfg$colors$neutral)
    val <- if (i %in% c(1, n)) dfa_fmt(bars[i, 2], cfg$digits, cfg) else dfa_fmt(e[i - 1], cfg$digits, cfg, TRUE)
    graphics::text(i, max(bars[i, ]), val, pos = 3, cex = 0.75 * cfg$base_font, col = cfg$colors$text, xpd = TRUE)
  }
  if (!isTRUE(from0)) graphics::mtext("ось Y не начинается с нуля", side = 2, line = 4.2, cex = 0.6, col = cfg$colors$neutral)
  graphics::mtext(lab, side = 1, at = seq_len(n), line = 0.4, padj = 1, cex = 0.72 * cfg$base_font)
}

# ---- Влияние факторов (горизонтальные столбики) ------------------------------
dfa_plot_effects <- function(r, cfg, method = r$main_method, shares = FALSE) {
  e <- r$effects[, method]
  v <- if (shares) dfa_safe_div(e, r$dy) * 100 else e
  if (all(!is.finite(v))) { graphics::plot.new(); graphics::title("ΔY = 0 — доли не определены"); return(invisible()) }
  o <- order(abs(v)); v <- v[o]
  lab <- dfa_wrap(dfa_labels(names(v), cfg), cfg$label_wrap + 10)
  op <- graphics::par(mai = c(0.9, dfa_left_margin(lab, 0.8), 0.9, 0.5)); on.exit(graphics::par(op))
  xr <- range(0, v, na.rm = TRUE); xr <- xr + c(-1, 1) * diff(xr) * 0.18
  bp <- graphics::barplot(v, horiz = TRUE, names.arg = lab, las = 1, xlim = xr, border = NA,
                          col = ifelse(v >= 0, cfg$colors$positive, cfg$colors$negative),
                          cex.names = 0.8 * cfg$base_font, axes = FALSE,
                          main = paste(if (shares) "Структура влияния факторов, % от ΔY" else "Влияние факторов на результат (ΔY)",
                                       "\n", dfa_subtitle(r, cfg)), cex.main = 0.95 * cfg$base_font)
  dfa_grid_v(cfg)
  graphics::barplot(v, horiz = TRUE, add = TRUE, names.arg = rep("", length(v)), border = NA, axes = FALSE,
                    col = ifelse(v >= 0, cfg$colors$positive, cfg$colors$negative))
  at <- pretty(xr); graphics::axis(1, at = at, labels = dfa_ylab_fmt(cfg)(at), cex.axis = 0.8)
  graphics::abline(v = 0, col = cfg$colors$text)
  txt <- if (shares) dfa_pct(v, cfg, TRUE) else dfa_fmt(v, cfg$digits, cfg, TRUE)
  graphics::text(v, bp, txt, pos = ifelse(v >= 0, 4, 2), cex = 0.75 * cfg$base_font, xpd = TRUE)
  if (shares) graphics::mtext(sprintf("ΔY = %s (100%%)", dfa_fmt(r$dy, cfg$digits, cfg, TRUE)), side = 1, line = 2.5, cex = 0.75)
}

# ---- Сравнение методов -------------------------------------------------------
dfa_plot_methods <- function(r, cfg) {
  m <- t(r$effects)
  if (nrow(m) < 1) return(invisible())
  cols <- rep(cfg$colors$methods, length.out = nrow(m))
  lab <- dfa_fit_labels(dfa_labels(colnames(m), cfg), ncol(m), 0.72 * cfg$base_font)
  bm <- max(1, max(sapply(strsplit(lab, "\n"), length)) * 0.2 + 0.5)
  op <- graphics::par(mai = c(bm, 1.1, 0.9, 0.2)); on.exit(graphics::par(op))
  yr <- range(0, m); yr <- yr + c(-0.08, 0.32) * diff(yr)  # сверху место под легенду
  bp <- graphics::barplot(m, beside = TRUE, col = cols, border = NA, ylim = yr, axes = FALSE, names.arg = rep("", ncol(m)),
                          main = paste("Сравнение методов элиминирования\n", dfa_subtitle(r, cfg)),
                          cex.main = 0.95 * cfg$base_font)
  dfa_grid_h(cfg)
  graphics::barplot(m, beside = TRUE, col = cols, border = NA, add = TRUE, axes = FALSE, names.arg = rep("", ncol(m)))
  at <- pretty(yr); graphics::axis(2, at = at, labels = dfa_ylab_fmt(cfg)(at), las = 1, cex.axis = 0.8)
  graphics::abline(h = 0)
  graphics::mtext(lab, side = 1, at = colMeans(bp), line = 0.4, padj = 1, cex = 0.72 * cfg$base_font)
  graphics::legend("topright", legend = DFA_METHOD_SHORT[rownames(m)], fill = cols, border = NA, bty = "n",
                   cex = 0.72 * cfg$base_font, ncol = min(4, nrow(m)))
}

# ---- Чувствительность к порядку подстановки -----------------------------------
dfa_plot_order <- function(r, cfg) {
  if (is.null(r$orders)) return(invisible())
  m <- r$orders$matrix; s <- r$orders$summary
  f <- colnames(m); k <- length(f)
  lab <- dfa_wrap(dfa_labels(f, cfg), cfg$label_wrap + 10)
  op <- graphics::par(mai = c(0.9, dfa_left_margin(lab, 0.8), 0.9, 0.3)); on.exit(graphics::par(op))
  xr <- range(m, 0); xr <- xr + c(-1, 1) * diff(xr) * 0.05
  graphics::plot(NA, xlim = xr, ylim = c(0.5, k + 0.5), yaxt = "n", xaxt = "n", xlab = "", ylab = "", bty = "n",
                 main = paste0("Чувствительность к порядку подстановки (", nrow(m), " перестановок)\n", dfa_subtitle(r, cfg)),
                 cex.main = 0.95 * cfg$base_font)
  dfa_grid_v(cfg); graphics::abline(v = 0)
  at <- pretty(xr); graphics::axis(1, at = at, labels = dfa_ylab_fmt(cfg)(at), cex.axis = 0.8)
  graphics::axis(2, at = seq_len(k), labels = lab, las = 1, cex.axis = 0.8, tick = FALSE)
  set.seed(1)
  for (i in seq_len(k)) {
    graphics::segments(s$min[i], i, s$max[i], i, lwd = 6, col = dfa_alpha(cfg$colors$neutral, 0.35))
    u <- unique(round(m[, i], 10))
    graphics::points(u, i + stats::runif(length(u), -0.15, 0.15), pch = 16, cex = 0.5, col = dfa_alpha(cfg$colors$total, 0.35))
  }
  graphics::points(s$mean, seq_len(k), pch = 23, bg = cfg$colors$positive, cex = 1.4)
  if ("chain" %in% r$ok_methods) graphics::points(r$effects[f, "chain"], seq_len(k), pch = 24, bg = "#F2C14E", cex = 1.3)
  if ("integral" %in% r$ok_methods) graphics::points(r$effects[f, "integral"], seq_len(k), pch = 4, lwd = 2, col = cfg$colors$negative, cex = 1.2)
  graphics::legend("bottomright", bty = "n", cex = 0.72, pch = c(16, 23, 24, 4), pt.bg = c(NA, cfg$colors$positive, "#F2C14E", NA),
                   col = c(cfg$colors$total, "black", "black", cfg$colors$negative),
                   legend = c("отдельный порядок", "среднее (Шепли)", "выбранный порядок", "интегральный"))
}

# ---- Цепочка условных показателей ---------------------------------------------
dfa_plot_chain_steps <- function(r, cfg) {
  if (!"chain" %in% r$ok_methods) return(invisible())
  st <- r$methods$chain$details
  n <- nrow(st)
  lab <- dfa_fit_labels(c(paste0("Y0\n", r$base_name), paste0("+ ", dfa_labels(st$substituted[-1], cfg))),
                        n, 0.72 * cfg$base_font)
  lab[n] <- paste0(lab[n], "\n= Y1")
  bm <- max(1, max(sapply(strsplit(lab, "\n"), length)) * 0.2 + 0.5)
  op <- graphics::par(mai = c(bm, 1.1, 0.9, 0.3)); on.exit(graphics::par(op))
  yr <- range(st$y); yr <- yr + c(-1, 1) * max(diff(yr), abs(yr[1]) * 0.01, 1e-9) * 0.15
  graphics::plot(seq_len(n), st$y, type = "n", xlim = c(0.7, n + 0.3), ylim = yr, xaxt = "n", yaxt = "n", xlab = "", ylab = "", bty = "n",
                 main = paste("Цепные подстановки: условные значения результата\n", dfa_subtitle(r, cfg)), cex.main = 0.95 * cfg$base_font)
  dfa_grid_h(cfg)
  at <- pretty(yr); graphics::axis(2, at = at, labels = dfa_ylab_fmt(cfg)(at), las = 1, cex.axis = 0.8)
  graphics::lines(seq_len(n), st$y, type = "s", col = cfg$colors$neutral, lwd = 1.5, lty = 2)
  graphics::lines(seq_len(n), st$y, col = cfg$colors$total, lwd = 2)
  cols <- c(cfg$colors$total, ifelse(diff(st$y) >= 0, cfg$colors$positive, cfg$colors$negative))
  cols[n] <- cfg$colors$total
  graphics::points(seq_len(n), st$y, pch = 21, bg = cols, cex = 1.8)
  graphics::text(seq_len(n), st$y, dfa_fmt(st$y, cfg$digits, cfg), pos = 3, cex = 0.72 * cfg$base_font, offset = 0.8)
  graphics::mtext(lab, side = 1, at = seq_len(n), line = 0.4, padj = 1, cex = 0.72 * cfg$base_font)
}

# ---- Темпы роста факторов ----------------------------------------------------
dfa_plot_dynamics <- function(r, cfg) {
  g <- c(r$table$growth_pct, r$dy_pct)
  names(g) <- c(dfa_labels(r$table$factor, cfg), paste0(cfg$response_label %||% r$model$response, " (результат)"))
  lab <- dfa_wrap(names(g), cfg$label_wrap + 10)
  op <- graphics::par(mai = c(0.9, dfa_left_margin(lab, 0.8), 0.9, 0.5)); on.exit(graphics::par(op))
  gv <- ifelse(is.finite(g), g, 0)
  xr <- range(0, gv); xr <- xr + c(-1, 1) * max(diff(xr), 1) * 0.2
  cols <- ifelse(gv >= 0, cfg$colors$positive, cfg$colors$negative); cols[length(cols)] <- cfg$colors$total
  bp <- graphics::barplot(rev(gv), horiz = TRUE, names.arg = rev(lab), las = 1, col = rev(cols), border = NA, xlim = xr,
                          cex.names = 0.8 * cfg$base_font, axes = FALSE,
                          main = paste("Темпы прироста факторов и результата, %\n", dfa_subtitle(r, cfg)), cex.main = 0.95 * cfg$base_font)
  dfa_grid_v(cfg)
  graphics::barplot(rev(gv), horiz = TRUE, add = TRUE, col = rev(cols), border = NA, axes = FALSE, names.arg = rep("", length(gv)))
  graphics::axis(1, cex.axis = 0.8); graphics::abline(v = 0)
  graphics::text(rev(gv), bp, rev(dfa_pct(g, cfg, TRUE)), pos = ifelse(rev(gv) >= 0, 4, 2), cex = 0.75, xpd = TRUE)
}

# ---- Эластичности -------------------------------------------------------------
dfa_plot_elasticity <- function(r, cfg) {
  s <- r$sensitivity; if (is.null(s)) return(invisible())
  v <- stats::setNames(s$elasticity, dfa_labels(s$factor, cfg)); v[!is.finite(v)] <- 0
  o <- order(abs(v)); v <- v[o]
  lab <- dfa_wrap(names(v), cfg$label_wrap + 10)
  op <- graphics::par(mai = c(0.9, dfa_left_margin(lab, 0.8), 0.9, 0.5)); on.exit(graphics::par(op))
  xr <- range(0, v); xr <- xr + c(-1, 1) * max(diff(xr), 0.1) * 0.2
  bp <- graphics::barplot(v, horiz = TRUE, names.arg = lab, las = 1, border = NA, xlim = xr, cex.names = 0.8,
                          col = ifelse(v >= 0, cfg$colors$positive, cfg$colors$negative), axes = FALSE,
                          main = paste0("Эластичность результата по факторам (точка: ",
                                        if (identical(cfg$sensitivity_point, "report")) r$report_name else r$base_name, ")\n",
                                        "на сколько % изменится Y при росте фактора на 1%"), cex.main = 0.95 * cfg$base_font)
  dfa_grid_v(cfg); graphics::axis(1, cex.axis = 0.8); graphics::abline(v = 0)
  graphics::barplot(v, horiz = TRUE, add = TRUE, border = NA, axes = FALSE, names.arg = rep("", length(v)),
                    col = ifelse(v >= 0, cfg$colors$positive, cfg$colors$negative))
  graphics::text(v, bp, dfa_fmt(v, 3, cfg, TRUE), pos = ifelse(v >= 0, 4, 2), cex = 0.75, xpd = TRUE)
}

# ---- Торнадо ------------------------------------------------------------------
dfa_plot_tornado <- function(r, cfg) {
  s <- r$sensitivity; if (is.null(s)) return(invisible())
  rng <- abs(s$tornado_high - s$tornado_low); o <- order(rng)
  lo <- s$tornado_low[o]; hi <- s$tornado_high[o]
  lab <- dfa_wrap(dfa_labels(s$factor[o], cfg), cfg$label_wrap + 10); k <- length(lab)
  op <- graphics::par(mai = c(0.9, dfa_left_margin(lab, 0.8), 0.9, 0.4)); on.exit(graphics::par(op))
  xr <- range(0, lo, hi); xr <- xr + c(-1, 1) * max(diff(xr), 1e-9) * 0.25
  graphics::plot(NA, xlim = xr, ylim = c(0.5, k + 0.5), yaxt = "n", xaxt = "n", xlab = "", ylab = "", bty = "n",
                 main = sprintf("Торнадо: изменение Y при изменении каждого фактора на ±%s%%\n(остальные факторы — на уровне «%s»)",
                                cfg$tornado_pct, if (identical(cfg$sensitivity_point, "report")) r$report_name else r$base_name),
                 cex.main = 0.95 * cfg$base_font)
  dfa_grid_v(cfg)
  at <- pretty(xr); graphics::axis(1, at = at, labels = dfa_ylab_fmt(cfg)(at), cex.axis = 0.8)
  graphics::axis(2, at = seq_len(k), labels = lab, las = 1, tick = FALSE, cex.axis = 0.8)
  h <- 0.35
  graphics::rect(pmin(0, lo), seq_len(k) - h, pmax(0, lo), seq_len(k) + h, col = dfa_alpha(cfg$colors$negative, 0.8), border = NA)
  graphics::rect(pmin(0, hi), seq_len(k) - h, pmax(0, hi), seq_len(k) + h, col = dfa_alpha(cfg$colors$positive, 0.8), border = NA)
  graphics::abline(v = 0, lwd = 1.5)
  graphics::text(lo, seq_len(k), dfa_fmt(lo, cfg$digits, cfg, TRUE), pos = ifelse(lo < 0, 2, 4), cex = 0.7, xpd = TRUE)
  graphics::text(hi, seq_len(k), dfa_fmt(hi, cfg$digits, cfg, TRUE), pos = ifelse(hi < 0, 2, 4), cex = 0.7, xpd = TRUE)
  graphics::legend("bottomright", bty = "n", fill = c(cfg$colors$negative, cfg$colors$positive), border = NA, cex = 0.75,
                   legend = c(paste0("фактор −", cfg$tornado_pct, "%"), paste0("фактор +", cfg$tornado_pct, "%")))
}

# ---- Сводная панель -----------------------------------------------------------
dfa_plot_dashboard <- function(r, cfg) {
  op <- graphics::par(mfrow = c(2, 2), oma = c(0, 0, 2.2, 0)); on.exit(graphics::par(op))
  cfg2 <- cfg; cfg2$base_font <- cfg$base_font * 0.85; cfg2$label_wrap <- max(10, cfg$label_wrap - 4)
  dfa_plot_waterfall(r, cfg2)
  dfa_plot_effects(r, cfg2, shares = TRUE)
  if (length(r$ok_methods) > 1) dfa_plot_methods(r, cfg2) else dfa_plot_chain_steps(r, cfg2)
  dfa_plot_dynamics(r, cfg2)
  graphics::mtext(sprintf("%s:  %s  |  ΔY = %s (%s)", cfg$title, r$model$text,
                          dfa_fmt(r$dy, cfg$digits, cfg, TRUE), dfa_pct(r$dy_pct, cfg, TRUE)),
                  outer = TRUE, cex = 0.95, font = 2)
}

# ---- Мультипериодные графики / группы -----------------------------------------
dfa_plot_periods <- function(results, cfg, title = "Вклад факторов в изменение результата по периодам") {
  f <- results[[1]]$model$factors
  m <- vapply(results, function(r) r$effects[f, r$main_method], numeric(length(f)))
  m <- matrix(m, nrow = length(f), dimnames = list(f, NULL))
  dy <- vapply(results, `[[`, numeric(1), "dy")
  lab <- vapply(results, function(r) paste0(r$base_name, "→", r$report_name), character(1))
  if (!is.null(results[[1]]$group) && length(unique(vapply(results, function(r) r$group %||% "", ""))) > 1)
    lab <- vapply(results, function(r) r$group, character(1))
  cols <- rep(cfg$colors$methods, length.out = length(f))
  pos <- pmax(m, 0); neg <- pmin(m, 0)
  yr <- range(0, colSums(pos), colSums(neg), dy); yr <- yr + c(-1, 1) * diff(yr) * 0.1
  op <- graphics::par(mai = c(1.1, 1.1, 0.9, 0.3)); on.exit(graphics::par(op))
  bp <- graphics::barplot(pos, col = cols, border = NA, ylim = yr, axes = FALSE, names.arg = rep("", ncol(m)),
                          main = paste0(title, "\n", DFA_METHOD_NAMES[results[[1]]$main_method]), cex.main = 0.95 * cfg$base_font)
  dfa_grid_h(cfg)
  graphics::barplot(pos, col = cols, border = NA, add = TRUE, axes = FALSE, names.arg = rep("", ncol(m)))
  graphics::barplot(neg, col = cols, border = NA, add = TRUE, axes = FALSE, names.arg = rep("", ncol(m)))
  graphics::abline(h = 0)
  at <- pretty(yr); graphics::axis(2, at = at, labels = dfa_ylab_fmt(cfg)(at), las = 1, cex.axis = 0.8)
  graphics::lines(bp, dy, type = "b", pch = 21, bg = "white", lwd = 2, col = cfg$colors$text)
  graphics::text(bp, dy, dfa_fmt(dy, cfg$digits, cfg, TRUE), pos = 3, cex = 0.7)
  graphics::mtext(dfa_wrap(lab, 14), side = 1, at = bp, line = 0.4, padj = 1, cex = 0.72, las = 1)
  graphics::legend("topleft", legend = c(dfa_labels(f, cfg), "ΔY"), fill = c(cols, NA), border = NA,
                   lty = c(rep(NA, length(f)), 1), pch = c(rep(NA, length(f)), 21), bty = "n", cex = 0.72,
                   ncol = min(3, length(f) + 1))
}

dfa_plot_series <- function(data, mdl, cfg, periods) {
  y <- vapply(seq_len(nrow(data)), function(i) mdl$fn(unlist(data[i, mdl$factors, drop = FALSE])), numeric(1))
  op <- graphics::par(mai = c(1, 1.1, 0.9, 0.3)); on.exit(graphics::par(op))
  yr <- range(y); yr <- yr + c(-1, 1) * max(diff(yr), abs(yr[1]) * 0.05, 1e-9) * 0.15
  graphics::plot(seq_along(y), y, type = "n", xaxt = "n", yaxt = "n", xlab = "", ylab = "", ylim = yr, bty = "n",
                 main = paste("Динамика результативного показателя:", cfg$response_label %||% mdl$response), cex.main = 0.95)
  dfa_grid_h(cfg)
  at <- pretty(yr); graphics::axis(2, at = at, labels = dfa_ylab_fmt(cfg)(at), las = 1, cex.axis = 0.8)
  graphics::axis(1, at = seq_along(y), labels = periods, cex.axis = 0.8)
  graphics::lines(seq_along(y), y, lwd = 2.5, col = cfg$colors$total)
  graphics::points(seq_along(y), y, pch = 21, bg = "white", col = cfg$colors$total, cex = 1.5, lwd = 2)
  graphics::text(seq_along(y), y, dfa_fmt(y, cfg$digits, cfg), pos = 3, cex = 0.72, offset = 0.8)
}

dfa_plot_heatmap <- function(results, cfg, row_labels, title) {
  f <- results[[1]]$model$factors
  m <- t(vapply(results, function(r) r$effects[f, r$main_method], numeric(length(f))))
  m <- matrix(m, ncol = length(f))
  k <- nrow(m)
  lim <- max(abs(m), 1e-12)
  pal <- grDevices::colorRampPalette(c(cfg$colors$negative, "#F7F7F7", cfg$colors$positive))(101)
  idx <- round((m + lim) / (2 * lim) * 100) + 1
  collab <- dfa_fit_labels(dfa_labels(f, cfg), length(f), 0.72, side_in = dfa_left_margin(row_labels, 0.8) + 0.3)
  op <- graphics::par(mai = c(1.1, dfa_left_margin(row_labels, 0.8), 0.9, 0.3)); on.exit(graphics::par(op))
  graphics::plot(NA, xlim = c(0.5, length(f) + 0.5), ylim = c(k + 0.5, 0.5), axes = FALSE, xlab = "", ylab = "",
                 main = paste0(title, "\n", DFA_METHOD_NAMES[results[[1]]$main_method]), cex.main = 0.95)
  for (i in seq_len(k)) for (j in seq_along(f)) {
    graphics::rect(j - 0.5, i - 0.5, j + 0.5, i + 0.5, col = pal[idx[i, j]], border = "white", lwd = 2)
    graphics::text(j, i, dfa_fmt(m[i, j], cfg$digits, cfg, TRUE), cex = 0.72,
                   col = if (abs(m[i, j]) > 0.6 * lim) "white" else cfg$colors$text)
  }
  graphics::axis(2, at = seq_len(k), labels = row_labels, las = 1, tick = FALSE, cex.axis = 0.8)
  graphics::mtext(collab, side = 1, at = seq_along(f), line = 0.4, padj = 1, cex = 0.72)
}

dfa_plot_groups <- function(results, cfg) {
  g <- vapply(results, function(r) r$group %||% "", "")
  dy <- vapply(results, `[[`, numeric(1), "dy"); pct <- vapply(results, `[[`, numeric(1), "dy_pct")
  o <- order(dy); lab <- g[o]
  op <- graphics::par(mai = c(0.9, dfa_left_margin(lab, 0.8), 0.9, 0.6)); on.exit(graphics::par(op))
  xr <- range(0, dy); xr <- xr + c(-1, 1) * diff(xr) * 0.25
  bp <- graphics::barplot(dy[o], horiz = TRUE, names.arg = lab, las = 1, border = NA, xlim = xr, axes = FALSE, cex.names = 0.8,
                          col = ifelse(dy[o] >= 0, cfg$colors$positive, cfg$colors$negative),
                          main = paste("Изменение результата по объектам:", cfg$response_label %||% results[[1]]$model$response),
                          cex.main = 0.95)
  dfa_grid_v(cfg); graphics::abline(v = 0)
  graphics::barplot(dy[o], horiz = TRUE, add = TRUE, border = NA, axes = FALSE, names.arg = rep("", length(o)),
                    col = ifelse(dy[o] >= 0, cfg$colors$positive, cfg$colors$negative))
  at <- pretty(xr); graphics::axis(1, at = at, labels = dfa_ylab_fmt(cfg)(at), cex.axis = 0.8)
  graphics::text(dy[o], bp, paste0(dfa_fmt(dy[o], cfg$digits, cfg, TRUE), " (", dfa_pct(pct[o], cfg, TRUE), ")"),
                 pos = ifelse(dy[o] >= 0, 4, 2), cex = 0.72, xpd = TRUE)
}

# ---- Движок сохранения графиков -------------------------------------------------
dfa_plot_device <- function(cfg) {
  env <- new.env()
  env$pdf_dev <- NULL; env$files <- character(0)
  dir <- file.path(cfg$output_dir, "plots"); dir.create(dir, showWarnings = FALSE, recursive = TRUE)
  cairo <- isTRUE(capabilities("cairo"))
  if (isTRUE(cfg$plot_pdf)) {
    pf <- file.path(cfg$output_dir, "dfa_plots.pdf")
    if (cairo) grDevices::cairo_pdf(pf, width = cfg$png_width, height = cfg$png_height, onefile = TRUE)
    else grDevices::pdf(pf, width = cfg$png_width, height = cfg$png_height, onefile = TRUE)
    env$pdf_dev <- grDevices::dev.cur(); env$files <- pf
  }
  env$draw <- function(name, fun) {
    ok <- TRUE
    if (!is.null(env$pdf_dev)) {
      grDevices::dev.set(env$pdf_dev)
      ok <- !inherits(tryCatch(fun(), error = function(e) { warning("График '", name, "': ", conditionMessage(e)); e }), "error")
    }
    if (isTRUE(cfg$plot_png) && ok) {
      f <- file.path(dir, paste0(dfa_safe_name(name), ".png"))
      if (cairo) grDevices::png(f, width = cfg$png_width, height = cfg$png_height, units = "in", res = cfg$png_dpi, type = "cairo")
      else grDevices::png(f, width = cfg$png_width, height = cfg$png_height, units = "in", res = cfg$png_dpi)
      tryCatch(fun(), error = function(e) warning("График '", name, "': ", conditionMessage(e)))
      grDevices::dev.off()
      env$files <- c(env$files, f)
    }
  }
  env$close <- function() if (!is.null(env$pdf_dev)) { grDevices::dev.set(env$pdf_dev); grDevices::dev.off() }
  env
}

dfa_plot_pair <- function(dev, r, cfg, prefix) {
  pt <- cfg$plot_types
  p <- function(type, name, fun) if (type %in% pt) dev$draw(paste0(prefix, name), fun)
  if (is.null(r$main_method)) return(invisible())
  p("dashboard", "00_dashboard", function() dfa_plot_dashboard(r, cfg))
  p("waterfall", "01_waterfall", function() dfa_plot_waterfall(r, cfg))
  p("effects", "02_effects", function() dfa_plot_effects(r, cfg))
  if (is.finite(r$dy) && r$dy != 0) p("shares", "03_shares", function() dfa_plot_effects(r, cfg, shares = TRUE))
  if (length(r$ok_methods) > 1) p("methods", "04_methods", function() dfa_plot_methods(r, cfg))
  if (!is.null(r$orders)) p("order", "05_order_sensitivity", function() dfa_plot_order(r, cfg))
  p("chain_steps", "06_chain_steps", function() dfa_plot_chain_steps(r, cfg))
  p("dynamics", "07_factor_growth", function() dfa_plot_dynamics(r, cfg))
  if (!is.null(r$sensitivity)) {
    p("elasticity", "08_elasticity", function() dfa_plot_elasticity(r, cfg))
    p("tornado", "09_tornado", function() dfa_plot_tornado(r, cfg))
  }
}


# =============================================================================
# 11. ОРКЕСТРАЦИЯ
# =============================================================================
dfa_make_pairs <- function(n, labels, cfg) {
  mode <- cfg$compare %||% "auto"
  if (n < 2) stop("Для анализа нужно минимум 2 периода (строки) — базисный и отчётный.")
  if (mode == "auto") mode <- if (n == 2) "first_last" else "chain"
  pairs <- switch(mode,
    first_last = list(c(1, n)),
    chain      = lapply(2:n, function(i) c(i - 1, i)),
    fixed_base = lapply(2:n, function(i) c(1, i)),
    custom     = {
      b <- match(as.character(cfg$base_period), labels); r <- match(as.character(cfg$report_period), labels)
      if (is.na(b) || is.na(r)) stop("base_period/report_period не найдены среди периодов: ", paste(labels, collapse = ", "))
      list(c(b, r))
    },
    stop("Неизвестный режим compare: ", mode))
  attr(pairs, "mode") <- mode
  pairs
}

dfa_run <- function(cfg = CONFIG) {
  cfg <- utils::modifyList(CONFIG, cfg, keep.null = TRUE)
  owidth <- options(width = 250); on.exit(options(owidth), add = TRUE)
  # --- демо ---
  if (is.null(cfg$data) && is.null(cfg$data_file) && !is.null(cfg$demo)) {
    d <- dfa_demo(cfg$demo)
    # настройки демо применяются, только если пользователь их не менял
    for (nm in setdiff(names(d), "data")) {
      if (nm == "model") { if (is.null(cfg$model)) cfg$model <- d$model }
      else if (identical(cfg[[nm]], CONFIG[[nm]])) cfg[[nm]] <- d[[nm]]
    }
    cfg$data <- d$data
    if (identical(cfg$output_dir, CONFIG$output_dir)) cfg$output_dir <- file.path(CONFIG$output_dir, cfg$demo)
  }
  if (is.null(cfg$model)) stop("Не задана модель (cfg$model), например 'Y = a * b * c'.")
  set.seed(cfg$seed %||% 42)
  dir.create(cfg$output_dir, showWarnings = FALSE, recursive = TRUE)

  mdl <- dfa_parse_model(cfg$model, cfg$submodels, cfg$constants, cfg$response_name, cfg)
  df <- if (!is.null(cfg$data)) cfg$data else dfa_read_data(cfg$data_file, cfg$sep, cfg$dec, cfg$sheet, cfg$encoding)
  prep <- dfa_prepare_data(df, mdl$factors, cfg); df <- prep$data; cfg <- prep$cfg
  if (is.null(cfg$response_label)) cfg$response_label <- mdl$response

  dfa_msg(cfg, "\n", strrep("#", 78), "\n  ", cfg$title, "\n", strrep("#", 78))
  dfa_msg(cfg, "Модель: ", mdl$text)
  dfa_msg(cfg, "Тип модели: ", DFA_MODEL_TYPES[mdl$type])
  if (!is.null(mdl$grad)) dfa_msg(cfg, "Производные: ", mdl$grad$type)
  if (length(mdl$groups)) dfa_msg(cfg, "Суммы факторов в модели: ",
                                  paste(vapply(mdl$groups, function(g) paste(deparse(g$expr), collapse = ""), ""), collapse = "; "))

  groups <- if (!is.null(cfg$group_col)) unique(as.character(df[[cfg$group_col]])) else list(NULL)
  results <- list(); by_group <- list()
  for (g in groups) {
    sub <- if (is.null(g)) df else df[as.character(df[[cfg$group_col]]) == g, , drop = FALSE]
    periods <- if (!is.null(cfg$period_col)) as.character(sub[[cfg$period_col]]) else {
      if (nrow(sub) == 2) c(cfg$base_label, cfg$report_label) else paste("Период", seq_len(nrow(sub)))
    }
    pairs <- dfa_make_pairs(nrow(sub), periods, cfg)
    has_y <- mdl$response %in% names(sub) && is.numeric(sub[[mdl$response]])
    gres <- list()
    for (p in pairs) {
      nb <- periods[p[1]]; nr <- periods[p[2]]
      if (nrow(sub) == 2 && is.null(cfg$period_col)) { nb <- cfg$base_label; nr <- cfg$report_label }
      r <- dfa_analyze_pair(mdl, unlist(sub[p[1], mdl$factors, drop = FALSE]), unlist(sub[p[2], mdl$factors, drop = FALSE]), cfg,
                            nb, nr, if (has_y) sub[[mdl$response]][p[1]], if (has_y) sub[[mdl$response]][p[2]], g)
      gres[[length(gres) + 1]] <- r
    }
    # итог first→last при цепной схеме
    total <- NULL
    if (attr(pairs, "mode") == "chain" && nrow(sub) > 2) {
      total <- dfa_analyze_pair(mdl, unlist(sub[1, mdl$factors, drop = FALSE]), unlist(sub[nrow(sub), mdl$factors, drop = FALSE]), cfg,
                                periods[1], periods[nrow(sub)], NULL, NULL, g)
    }
    by_group[[length(by_group) + 1]] <- list(group = g, periods = periods, data = sub, pairs = gres,
                                             total = total, mode = attr(pairs, "mode"))
    results <- c(results, gres)
  }

  # --- отчёт ---
  report <- c(paste0(cfg$title), paste("Дата расчёта:", format(Sys.time(), "%Y-%m-%d %H:%M")), "")
  for (bg in by_group) {
    for (r in bg$pairs) report <- c(report, dfa_pair_report(r, cfg))
    if (!is.null(bg$total)) {
      report <- c(report, "", paste0("ИТОГ ЗА ВЕСЬ ПЕРИОД (", bg$periods[1], " → ", utils::tail(bg$periods, 1), ")"),
                  dfa_pair_report(bg$total, cfg))
      # сумма цепных вкладов
      f <- mdl$factors
      cum <- Reduce(`+`, lapply(bg$pairs, function(r) r$effects[f, r$main_method]))
      report <- c(report, "Сумма вкладов по цепной схеме (для сравнения с прямым итогом):",
                  sprintf("  • %s: %s  (напрямую: %s)", dfa_labels(f, cfg), dfa_fmt(cum, cfg$digits, cfg, TRUE),
                          dfa_fmt(bg$total$effects[f, bg$total$main_method], cfg$digits, cfg, TRUE)), "")
    }
  }
  if (length(by_group) > 1) {
    report <- c(report, strrep("=", 78), " СРАВНЕНИЕ ОБЪЕКТОВ", strrep("=", 78))
    f <- mdl$factors
    cmp <- do.call(rbind, lapply(results, function(r) data.frame("Объект" = r$group, "Период" = paste(r$base_name, "→", r$report_name),
      Y0 = dfa_fmt(r$y0, cfg$digits, cfg), Y1 = dfa_fmt(r$y1, cfg$digits, cfg), "ΔY" = dfa_fmt(r$dy, cfg$digits, cfg, TRUE),
      t(stats::setNames(dfa_fmt(r$effects[f, r$main_method], cfg$digits, cfg, TRUE), f)), check.names = FALSE)))
    report <- c(report, utils::capture.output(print(cmp, row.names = FALSE, right = FALSE)), "")
  }
  if (isTRUE(cfg$verbose)) cat(report, sep = "\n")

  # --- файлы ---
  files <- character(0)
  if (isTRUE(cfg$save_txt)) {
    tf <- file.path(cfg$output_dir, "dfa_report.txt")
    con <- file(tf, "w", encoding = "UTF-8"); writeLines(report, con); close(con); files <- c(files, tf)
  }
  tables <- dfa_collect_tables(results, by_group, mdl, cfg)
  if (isTRUE(cfg$save_csv)) {
    cdir <- file.path(cfg$output_dir, "tables"); dir.create(cdir, showWarnings = FALSE)
    for (nm in names(tables)) { f <- file.path(cdir, paste0(nm, ".csv")); dfa_write_csv(tables[[nm]], f, cfg); files <- c(files, f) }
  }
  if (isTRUE(cfg$save_xlsx) && requireNamespace("openxlsx", quietly = TRUE)) {
    xf <- file.path(cfg$output_dir, "dfa_results.xlsx")
    wb <- openxlsx::createWorkbook()
    for (nm in names(tables)) { sh <- substr(nm, 1, 31); openxlsx::addWorksheet(wb, sh); openxlsx::writeData(wb, sh, tables[[nm]]) }
    openxlsx::saveWorkbook(wb, xf, overwrite = TRUE); files <- c(files, xf)
  }

  # --- графики ---
  if (isTRUE(cfg$plots)) {
    dev <- dfa_plot_device(cfg)
    tryCatch({
      multi <- length(results) > 1
      for (bg in by_group) {
        gp <- if (!is.null(bg$group)) paste0(dfa_safe_name(bg$group), "_") else ""
        if (isTRUE(cfg$plots_per_pair) || !multi)
          for (r in bg$pairs) dfa_plot_pair(dev, r, cfg, if (multi) paste0(gp, dfa_safe_name(paste0(r$base_name, "-", r$report_name)), "_") else "")
        if (!is.null(bg$total)) dfa_plot_pair(dev, bg$total, cfg, paste0(gp, "TOTAL_"))
        if (length(bg$pairs) > 1) {
          if ("periods" %in% cfg$plot_types) {
            dev$draw(paste0(gp, "10_periods_contrib"), function() dfa_plot_periods(bg$pairs, cfg,
              paste0("Вклад факторов по периодам", if (!is.null(bg$group)) paste0(" — ", bg$group) else "")))
            dev$draw(paste0(gp, "11_series"), function() dfa_plot_series(bg$data, mdl, cfg, bg$periods))
          }
          if ("heatmap" %in% cfg$plot_types)
            dev$draw(paste0(gp, "12_heatmap"), function() dfa_plot_heatmap(bg$pairs, cfg,
              vapply(bg$pairs, function(r) paste0(r$base_name, "→", r$report_name), ""), "Тепловая карта влияния факторов по периодам"))
        }
      }
      if (length(by_group) > 1 && "groups" %in% cfg$plot_types) {
        last <- lapply(by_group, function(bg) if (!is.null(bg$total)) bg$total else utils::tail(bg$pairs, 1)[[1]])
        dev$draw("20_groups_dy", function() dfa_plot_groups(last, cfg))
        dev$draw("21_groups_heatmap", function() dfa_plot_heatmap(last, cfg, vapply(last, function(r) r$group, ""),
                                                                   "Влияние факторов по объектам"))
        dev$draw("22_groups_contrib", function() dfa_plot_periods(last, cfg, "Вклад факторов по объектам"))
      }
    }, finally = dev$close())
    files <- c(files, dev$files)
  }

  out <- list(config = cfg, model = mdl, data = df, results = results, by_group = by_group,
              tables = tables, report = report, files = files)
  class(out) <- "dfa_run"
  if (isTRUE(cfg$save_rds)) { rf <- file.path(cfg$output_dir, "dfa_results.rds"); saveRDS(out, rf); out$files <- c(out$files, rf) }
  dfa_msg(cfg, "\nГотово. Результаты сохранены в: ", normalizePath(cfg$output_dir),
          "\n  файлов: ", length(out$files), "  (отчёт, таблицы CSV, графики PNG/PDF, RDS)")
  invisible(out)
}

dfa_collect_tables <- function(results, by_group, mdl, cfg) {
  f <- mdl$factors
  tag <- function(r) data.frame(group = r$group %||% "", base_period = r$base_name, report_period = r$report_name, stringsAsFactors = FALSE)
  eff <- do.call(rbind, lapply(results, function(r) cbind(tag(r)[rep(1, nrow(r$table)), ], r$table)))
  long <- do.call(rbind, lapply(results, function(r) {
    do.call(rbind, lapply(r$ok_methods, function(m) data.frame(tag(r)[rep(1, length(f)), ], method = m,
      method_name = DFA_METHOD_NAMES[m], factor = f, label = dfa_labels(f, cfg), effect = r$effects[f, m],
      share_pct = dfa_safe_div(r$effects[f, m], r$dy) * 100, stringsAsFactors = FALSE)))
  }))
  summ <- do.call(rbind, lapply(results, function(r) data.frame(tag(r), y0 = r$y0, y1 = r$y1, delta = r$dy,
    growth_pct = r$dy_pct, index = r$iy, main_method = r$main_method, model = r$model$text, stringsAsFactors = FALSE)))
  bal <- do.call(rbind, lapply(results, function(r) cbind(tag(r)[rep(1, nrow(r$balance)), ], r$balance)))
  out <- list(summary = summ, effects = eff, effects_long = long, balance = bal)
  chain <- do.call(rbind, lapply(results, function(r) if ("chain" %in% r$ok_methods)
    cbind(tag(r)[rep(1, nrow(r$methods$chain$details)), ], r$methods$chain$details)))
  if (!is.null(chain)) out$chain_steps <- chain
  ord <- do.call(rbind, lapply(results, function(r) if (!is.null(r$orders)) cbind(tag(r)[rep(1, length(f)), ], r$orders$summary)))
  if (!is.null(ord)) out$order_sensitivity <- ord
  sen <- do.call(rbind, lapply(results, function(r) if (!is.null(r$sensitivity)) cbind(tag(r)[rep(1, length(f)), ], r$sensitivity)))
  if (!is.null(sen)) out$sensitivity <- sen
  tot <- do.call(rbind, lapply(by_group, function(bg) if (!is.null(bg$total)) cbind(tag(bg$total)[rep(1, length(f)), ], bg$total$table)))
  if (!is.null(tot)) out$total_period <- tot
  for (nm in names(out)) rownames(out[[nm]]) <- NULL
  out
}

# Короткий API: dfa_analyze("Y = a*b", base = c(a=1,b=2), report = c(a=2,b=3))
#               dfa_analyze("Y = a*b", data = df, ...)
dfa_analyze <- function(model, data = NULL, base = NULL, report = NULL, ...) {
  cfg <- utils::modifyList(CONFIG, list(...), keep.null = TRUE)
  cfg$model <- model; cfg$demo <- NULL
  if (!is.null(base)) {
    b <- as.list(base); r <- as.list(report)
    data <- data.frame(.period = c(cfg$base_label, cfg$report_label), rbind(unlist(b), unlist(r)[names(b)]),
                       check.names = FALSE, stringsAsFactors = FALSE)
    cfg$period_col <- ".period"
  }
  cfg$data <- data
  dfa_run(cfg)
}

print.dfa_run <- function(x, ...) { cat(x$report, sep = "\n"); invisible(x) }
print.dfa_pair <- function(x, ...) { cat(dfa_pair_report(x, CONFIG), sep = "\n"); invisible(x) }


# =============================================================================
# 12. ЗАПУСК ИЗ КОМАНДНОЙ СТРОКИ
# =============================================================================
dfa_cli <- function(args = commandArgs(trailingOnly = TRUE)) {
  cfg <- CONFIG
  kv <- regmatches(args, regexec("^--([^=]+)=(.*)$", args))
  opts <- list()
  for (m in kv) if (length(m) == 3) opts[[m[2]]] <- m[3]
  if (!is.null(opts$config)) {
    e <- new.env(); e$CONFIG <- CONFIG
    sys.source(opts$config, envir = e)
    cfg <- e$CONFIG
  }
  if (!is.null(opts$data))  { cfg$data_file <- opts$data; cfg$demo <- NULL }
  if (!is.null(opts$model)) cfg$model <- opts$model
  if (!is.null(opts$out))   cfg$output_dir <- opts$out
  if (!is.null(opts$order)) cfg$order <- strsplit(opts$order, "[,; ]+")[[1]]
  if (!is.null(opts$method)) cfg$main_method <- opts$method
  if (!is.null(opts$compare)) cfg$compare <- opts$compare
  if (!is.null(opts$group))  cfg$group_col <- opts$group
  if (!is.null(opts$period)) cfg$period_col <- opts$period
  if (!is.null(opts$demo)) {
    if (opts$demo == "all") {
      for (d in c("multiplicative", "multiple", "mixed", "additive", "dupont", "groups", "custom")) {
        c2 <- cfg; c2$demo <- d; c2$data <- NULL; c2$data_file <- NULL; c2$model <- NULL
        dfa_run(c2)
      }
      return(invisible())
    }
    cfg$demo <- opts$demo; cfg$data_file <- NULL; cfg$model <- NULL
  }
  dfa_run(cfg)
}

if (!exists("DFA_NO_RUN") || !isTRUE(get("DFA_NO_RUN"))) {
  if (!interactive()) dfa_cli() else dfa_run(CONFIG)
}
