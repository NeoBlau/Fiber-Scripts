# Пример собственного конфига.
# Запуск: Rscript deterministic_factor_analysis.R --config=examples/my_config.R
# Файл выполняется в окружении, где уже есть CONFIG со значениями по умолчанию:
# меняйте только нужные поля.

CONFIG$demo      <- NULL
CONFIG$data_file <- "examples/example_periods.csv"
CONFIG$model     <- "PR = Q * (Pr - V) - FC"      # прибыль = объём × (цена − перем. затраты) − пост. затраты

CONFIG$period_col <- "year"
CONFIG$compare    <- "chain"   # 2021→2022, 2022→2023, ... + итог 2021→2025
# CONFIG$compare  <- "custom"; CONFIG$base_period <- "2021"; CONFIG$report_period <- "2025"

CONFIG$factor_labels <- c(Q  = "Объём продаж, шт.",
                          Pr = "Цена за ед., руб.",
                          V  = "Переменные затраты на ед., руб.",
                          FC = "Постоянные затраты, руб.")
CONFIG$factor_types  <- c(Q = "quantitative", Pr = "qualitative",
                          V = "qualitative",  FC = "quantitative")
CONFIG$response_label <- "Прибыль от продаж, руб."

CONFIG$order       <- "auto"      # сначала количественные, потом качественные
CONFIG$main_method <- "integral"  # графики и выводы — по интегральному методу
CONFIG$methods     <- c("chain", "integral", "shapley", "proportional")

CONFIG$digits      <- 0
CONFIG$tornado_pct <- 5
CONFIG$output_dir  <- "dfa_output/my_analysis"
CONFIG$plots_per_pair <- FALSE    # только сводные графики + итог за весь период
