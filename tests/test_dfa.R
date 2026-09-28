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

# Кратная с суммой в знаменателе
r <- an("R = P/(F + E)*100", base = c(P = 1800, F = 9000, E = 6000), report = c(P = 2250, F = 9800, E = 7400))
chk("кратная: тип",                  r$model$type == "multiple")
chk("кратная: цепные P = 3",         abs(r$effects["P", "chain"] - 3) < 1e-9)
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

# Все демо запускаются
for (d in c("multiplicative", "multiple", "mixed", "additive", "dupont", "groups", "custom")) {
  res <- tryCatch(dfa_run(c(list(demo = d), q)), error = function(e) NULL)
  chk(paste("демо", d), !is.null(res) && all(vapply(res$results, function(r) all(r$balance$ok), TRUE)))
}
cat(if (fails) sprintf("\nПРОВАЛЕНО: %d\n", fails) else "\nВсе проверки пройдены\n")
quit(status = as.integer(fails > 0))
