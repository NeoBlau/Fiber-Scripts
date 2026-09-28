# Проверки корректности: Rscript tests/test_dfa.R  (из корня репозитория)
DFA_NO_RUN <- TRUE
source("deterministic_factor_analysis.R", encoding = "UTF-8")
q <- list(verbose = FALSE, plots = FALSE, save_csv = FALSE, save_rds = FALSE, save_txt = FALSE)
fails <- 0
chk <- function(name, cond) {
  ok <- isTRUE(cond); if (!ok) fails <<- fails + 1
  cat(sprintf("%-50s %s\n", name, if (ok) "OK" else "FAIL"))
}
an <- function(...) do.call(dfa_analyze, c(list(...), q))$results[[1]]

# Эталон из учебника: Y = a*b, (100; 10) -> (120; 12), ΔY = 440
r <- an("Y = a*b", base = c(a = 100, b = 10), report = c(a = 120, b = 12)); e <- r$effects
chk("цепные: 200 / 240",            isTRUE(all.equal(unname(e[, "chain"]), c(200, 240))))
chk("абсолютные разницы = цепные",   isTRUE(all.equal(e[, "abs_diff"], e[, "chain"])))
chk("относительные разницы = цепные",isTRUE(all.equal(e[, "rel_diff"], e[, "chain"])))
chk("индексный = цепные",            isTRUE(all.equal(e[, "index"], e[, "chain"])))
chk("интегральный: 220 / 220",       isTRUE(all.equal(unname(e[, "integral"]), c(220, 220))))
chk("логарифмический: 220 / 220",    isTRUE(all.equal(unname(e[, "log"]), c(220, 220))))
chk("Шепли: 220 / 220",              isTRUE(all.equal(unname(e[, "shapley"]), c(220, 220))))

# Смешанная: PR = Q*(P - V) - F
r <- an("PR = Q*(P - V) - F", base = c(Q = 12000, P = 850, V = 520, F = 2.1e6),
        report = c(Q = 12800, P = 870, V = 545, F = 2.25e6))
chk("смешанная: тип",                r$model$type == "mixed")
chk("смешанная: цепные Q = 264000",  abs(r$effects["Q", "chain"] - 264000) < 1e-6)
chk("смешанная: интегр. Q = 262000", abs(r$effects["Q", "integral"] - 262000) < 1e-6)
chk("смешанная: баланс всех методов",all(r$balance$ok))
chk("смешанная: абс. разницы = цепные", "abs_diff" %in% r$ok_methods && isTRUE(all.equal(r$effects[, "abs_diff"], r$effects[, "chain"])))
chk("смешанная: формула ΔQ × (P0 - V0)", r$methods$abs_diff$details$formula[1] == "ΔY(Q) = ΔQ × (P0 - V0)")
chk("смешанная: формула −ΔF",        r$methods$abs_diff$details$formula[4] == "ΔY(F) = −ΔF")

# Кратная с суммой в знаменателе
r <- an("R = P/(F + E)*100", base = c(P = 1800, F = 9000, E = 6000), report = c(P = 2250, F = 9800, E = 7400))
chk("кратная: тип",                  r$model$type == "multiple")
chk("кратная: цепные P = 3",         abs(r$effects["P", "chain"] - 3) < 1e-9)
chk("кратная: абс. разницы = цепные", isTRUE(all.equal(r$effects[, "abs_diff"], r$effects[, "chain"])))
chk("пропорц.: F:E = 800:1400",      abs(r$effects["F", "proportional"] / r$effects["E", "proportional"] - 800 / 1400) < 1e-9)

# Аддитивная, в т.ч. взаимное погашение (ΔY = 0)
r <- an("Y = a + b - c", base = c(a = 1, b = 2, c = 3), report = c(a = 4, b = 1, c = 5))
chk("аддитивная: тип",               r$model$type == "additive")
chk("аддитивная: влияния = ±Δx",     isTRUE(all.equal(unname(r$effects[, "proportional"]), c(3, -1, -2))))

# Граничные случаи
r <- an("Y = a*b", base = c(a = 0, b = 10), report = c(a = 5, b = -2))
chk("нули/минусы: log и index исключены", !any(c("log", "index", "rel_diff") %in% r$ok_methods))
r <- an("Y = 2*a", base = c(a = 1), report = c(a = 3))
chk("один фактор",                   abs(r$effects["a", "chain"] - 4) < 1e-12)
r <- an(function(a, b) { z <- a * b; if (z > 0) sqrt(z) else 0 }, base = c(a = 4, b = 9), report = c(a = 9, b = 16))
chk("модель-функция: баланс",        r$model$type == "black_box" && all(r$balance$ok))
r <- an("Y = a*b", submodels = list(b = "d + e"), base = c(a = 2, d = 1, e = 3), report = c(a = 3, d = 2, e = 3))
chk("подмодели",                     setequal(r$model$factors, c("a", "d", "e")))
r <- an("Y = ifelse(a > 0, a*b, 0)", base = c(a = 1, b = 2), report = c(a = 2, b = 3))
chk("численная производная",         "integral" %in% r$ok_methods && all(r$balance$ok))
r <- an("Y = a*b", base = c(a = 100, b = 10), report = c(a = 120, b = 12), order = c("b", "a"))
chk("явный порядок подстановки",     isTRUE(all.equal(unname(r$effects[c("a", "b"), "chain"]), c(240, 200))))

# Конфиг: запись -> чтение без потерь
tmp <- tempfile(fileext = ".R")
c1 <- utils::modifyList(CONFIG, list(model = "Y = a*(b - c)", order = c("c", "a", "b"), big_mark = " ",
                                     factor_labels = c(a = "Объём"), constants = list(k = 2),
                                     proportional_groups = list(G = c("b", "c")), csv_sep = "\t"), keep.null = TRUE)
dfa_config_write(c1, tmp); c2 <- dfa_config_read(tmp)
chk("конфиг: сохранение и загрузка",   identical(c1[names(c1) != "data"], c2[names(c2) != "data"]))
# Преобразования полей GUI: строка <-> значение
fl <- dfa_gui_fields()
ok <- TRUE
for (f in fl) if (f$type != "checks") {
  v <- dfa_gui_get(c1, f$key)
  back <- dfa_gui_from_str(dfa_gui_to_str(v, f$type), f$type, f$key)
  if (!(identical(back, v) || (is.numeric(v) && isTRUE(all.equal(as.numeric(back), v))) ||
        (is.null(back) && (is.null(v) || length(v) == 0)))) { ok <- FALSE; cat("  поле", f$key, "\n") }
}
chk("GUI: поля конвертируются без потерь", ok)

# Регрессия по итогам аудита
r <- an("Y = 3 * a", base = c(a = 2), report = c(a = 5))
chk("один фактор: влияние = ΔY",       abs(r$effects["a", "chain"] - 9) < 1e-12)
chk("формат: малые числа не «0,00»",   dfa_fmt(0.000123, 2) == "0,000123")
chk("формат: digits = 0 не портится",  dfa_fmt(5, 0) == "5")
chk("формат: обычные числа",           dfa_fmt(1234.567, 2) == "1 234,57")
chk("числа из Excel: 1 234,5 / 12,5% / (1 234) / −5",
    isTRUE(all.equal(dfa_parse_num(c("1 234,5", "12,5%", "(1 234)", "−5")), c(1234.5, 12.5, -1234, -5))))
e1 <- an("Y = k*a*b", base = c(a = 2, b = 3), report = c(a = 3, b = 5), constants = list(k = 1))$effects[, "shapley"]
e2 <- an("Y = k*a*b", base = c(a = 2, b = 3), report = c(a = 3, b = 5), constants = list(k = 10))$effects[, "shapley"]
chk("кэш: смена константы учитывается", isTRUE(all.equal(e2, 10 * e1)))
set.seed(1); u1 <- runif(1); set.seed(1)
invisible(an(paste("Y =", paste0("x", 1:9, collapse = "*")), base = setNames(1:9, paste0("x", 1:9)), report = setNames(2:10, paste0("x", 1:9))))
chk("RNG пользователя не меняется",    runif(1) == u1)
tm <- system.time(r <- an(paste("Y =", paste0("x", 1:8, collapse = "*")), base = setNames(1:8, paste0("x", 1:8)),
                          report = setNames(2:9, paste0("x", 1:8))))[3]
chk("8 факторов: быстро (< 10 с)",     tm < 10 && r$orders$full && nrow(r$orders$matrix) == 40320)
chk("8 факторов: Шепли = среднее 8!",  isTRUE(all.equal(unname(colMeans(r$orders$matrix)), unname(r$effects[, "shapley"]))))
err <- tryCatch(dfa_prepare_data(data.frame(period = 1:2, q = 1:2, price = 1:2), c("Q", "Pr"), CONFIG), error = function(e) conditionMessage(e))
chk("подсказка похожих столбцов",      grepl("Q → «q»", err) && grepl("Pr → «price»", err))

# Все демо запускаются
for (d in c("multiplicative", "multiple", "mixed", "additive", "dupont", "groups", "custom")) {
  res <- tryCatch(dfa_run(c(list(demo = d), q)), error = function(e) NULL)
  chk(paste("демо", d), !is.null(res) && all(vapply(res$results, function(r) all(r$balance$ok), TRUE)))
}
cat(if (fails) sprintf("\nПРОВАЛЕНО: %d\n", fails) else "\nВсе проверки пройдены\n")
quit(status = as.integer(fails > 0))
