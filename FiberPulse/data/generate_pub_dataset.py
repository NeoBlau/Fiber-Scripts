"""
Тестовые данные для Fiber Pulse: паб «Гарцующий пони» (Бри, Средиземье).
Паб вымышленный, все цифры выдуманы. Нужны только чтобы проверить программу.

Запуск:  python3 generate_pub_dataset.py      (нужны pandas и openpyxl:
         pip install pandas openpyxl)

Создаёт:
  1_pony_sales_monthly.csv     — длинная таблица: месяц × позиция,
                                 столбцы Продано, Цена, Выручка, Себестоимость
  2_pony_revenue_by_month.xlsx    — позиции × месяцы (как обычно делают в Excel),
                                 лист «Выручка» и лист «Продано»
  3_pony_costs.csv           — статьи затрат × месяцы (бюджет)
  4_pony_daily_2025.csv      — продажи по дням за 2025 год (программа сама
                                 соберёт дни в месяцы)

Что заложено в данные, чтобы было что находить:
  * сезонность: летом растут лагер, сидр и лимонад, зимой — стаут, глинтвейн и пироги;
  * повышение цен каждый январь (+5…9%) и дополнительное летом 2025 на пиво;
  * июнь–июль 2024: чемпионат по метанию дротиков — всплеск пива и закусок;
  * февраль 2025: ремонт кухни 2 недели — провал по еде;
  * апрель 2024: в меню появился «Крафтовый IPA Хоббитон»;
  * сентябрь 2025: убрали «Бургер Бри» (выбывшая позиция);
  * постепенно растущая популярность «Пастушьего пирога» и падение «Джина».
"""
import numpy as np
import pandas as pd
from pathlib import Path

OUT = Path(__file__).resolve().parent
rng = np.random.default_rng(2025)
months = pd.period_range("2023-01", "2025-12", freq="M")
N = len(months)

# название, группа, продаж в месяц (база), цена 2023, себестоимость %, рост/мес, сезонность (янв..дек),
# первый месяц (индекс), последний месяц (не включая)
WARM = [0.8, 0.8, 0.9, 1.0, 1.1, 1.25, 1.35, 1.3, 1.05, 0.95, 0.85, 0.9]
COLD = [1.3, 1.25, 1.1, 0.95, 0.85, 0.75, 0.7, 0.75, 0.9, 1.05, 1.2, 1.4]
FLAT = [1.0] * 12
DEC = [0.95, 0.9, 0.95, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.05, 1.1, 1.35]
MENU = [
    ("Эль «Гарцующий пони» 0,5", "Пиво разливное", 3100, 390, 0.30, 0.004, DEC),
    ("Лагер «Бри» 0,5", "Пиво разливное", 2600, 350, 0.28, 0.003, WARM),
    ("Стаут «Тёмный лес» 0,5", "Пиво разливное", 1500, 420, 0.32, 0.002, COLD),
    ("Сидр «Яблочный Шир» 0,5", "Пиво разливное", 1100, 380, 0.33, 0.006, WARM),
    ("Крафтовый IPA «Хоббитон» 0,5", "Пиво разливное", 900, 460, 0.36, 0.015, WARM, 15),
    ("Виски «Старый Тук» 50 мл", "Крепкое", 650, 520, 0.38, 0.003, COLD),
    ("Джин «Туманные горы» 50 мл", "Крепкое", 520, 480, 0.35, -0.012, WARM),
    ("Глинтвейн 250 мл", "Крепкое", 700, 390, 0.30, 0.004, [1.6, 1.4, 1.0, 0.6, 0.3, 0.2, 0.2, 0.25, 0.5, 0.9, 1.4, 2.0]),
    ("Лимонад «Ривенделл» 0,4", "Безалкогольное", 800, 260, 0.20, 0.008, WARM),
    ("Кофе американо", "Безалкогольное", 1400, 210, 0.18, 0.005, COLD),
    ("Чай с травами Шира", "Безалкогольное", 900, 190, 0.12, 0.002, COLD),
    ("Рыба и картофель", "Кухня", 1300, 690, 0.38, 0.003, FLAT),
    ("Пастуший пирог", "Кухня", 700, 620, 0.35, 0.018, COLD),
    ("Бургер «Бри»", "Кухня", 1000, 640, 0.40, -0.006, FLAT, 0, 32),
    ("Похлёбка Сэма", "Кухня", 600, 450, 0.30, 0.004, COLD),
    ("Сырная тарелка", "Закуски", 500, 590, 0.42, 0.003, DEC),
    ("Куриные крылья", "Закуски", 1200, 480, 0.37, 0.005, WARM),
    ("Луковые кольца", "Закуски", 900, 290, 0.25, 0.002, FLAT),
]

rows = []
for item in MENU:
    name, group, base, price0, cost_share, growth, season = item[:7]
    first = item[7] if len(item) > 7 else 0
    last = item[8] if len(item) > 8 else N
    price = float(price0)
    for t, per in enumerate(months):
        m = per.month - 1
        if per.month == 1 and t > 0:
            price *= 1 + rng.uniform(0.05, 0.09)                      # январская индексация
        if group == "Пиво разливное" and str(per) == "2025-07":
            price *= 1.06                                             # летнее повышение 2025
        if t < first or t >= last:
            continue
        ramp = min(1.0, (t - first + 1) / 5) if first else 1.0        # новая позиция набирает обороты
        qty = base * season[m] * np.exp(growth * t) * ramp * rng.lognormal(0, 0.05)
        if str(per) in ("2024-06", "2024-07") and group in ("Пиво разливное", "Закуски"):
            qty *= 1.28                                               # чемпионат по дротикам
        if str(per) == "2025-02" and group == "Кухня":
            qty *= 0.52                                               # ремонт кухни
        qty = int(round(qty))
        p = int(round(price * rng.normal(1, 0.004) / 5) * 5)          # цены кратны 5 руб.
        unit_cost = round(p * cost_share * rng.normal(1, 0.02), 2)
        rows.append({
            "Месяц": per.to_timestamp().strftime("%d.%m.%Y"),
            "Позиция": name, "Группа": group,
            "Продано, шт.": qty, "Цена, руб.": p,
            "Выручка, руб.": qty * p,
            "Себестоимость, руб.": round(qty * unit_cost),
        })

sales = pd.DataFrame(rows)
sales.to_csv(OUT / "1_pony_sales_monthly.csv", sep=";", decimal=",", index=False, encoding="utf-8-sig")

# Широкие таблицы «позиции × месяцы» в Excel
def wide(col):
    w = sales.pivot_table(index=["Позиция", "Группа"], columns="Месяц", values=col, aggfunc="sum", sort=False)
    order = sorted(w.columns, key=lambda s: pd.to_datetime(s, dayfirst=True))
    w = w[order]
    w.columns = [pd.to_datetime(c, dayfirst=True).strftime("%Y-%m") for c in order]
    return w.reset_index()

with pd.ExcelWriter(OUT / "2_pony_revenue_by_month.xlsx", engine="openpyxl") as xw:
    wide("Выручка, руб.").to_excel(xw, sheet_name="Выручка", index=False)
    wide("Продано, шт.").to_excel(xw, sheet_name="Продано", index=False)

# Затраты паба: статьи × месяцы
COSTS = [
    ("Аренда помещения", "Постоянные", 420000, 0.0, FLAT, 0.0),
    ("Зарплата бар", "Персонал", 610000, 0.004, FLAT, 0.02),
    ("Зарплата кухня", "Персонал", 540000, 0.004, FLAT, 0.02),
    ("Закупка пива и напитков", "Закупки", 980000, 0.006, WARM, 0.05),
    ("Продукты для кухни", "Закупки", 720000, 0.005, COLD, 0.05),
    ("Коммунальные услуги", "Постоянные", 95000, 0.003, COLD, 0.06),
    ("Музыка и мероприятия", "Маркетинг", 60000, 0.008, DEC, 0.25),
    ("Реклама", "Маркетинг", 45000, 0.01, FLAT, 0.3),
    ("Ремонт и обслуживание", "Прочие", 30000, 0.0, FLAT, 0.4),
]
crow = []
for name, group, base, growth, season, noise in COSTS:
    rec = {"Статья": name, "Группа": group}
    for t, per in enumerate(months):
        v = base * season[per.month - 1] * np.exp(growth * t) * (1 + rng.normal(0, noise))
        if name.startswith("Зарплата") and per.year >= 2024: v *= 1.08
        if name.startswith("Зарплата") and per.year >= 2025: v *= 1.07
        if name == "Ремонт и обслуживание" and str(per) == "2025-02": v += 380000   # ремонт кухни
        rec[per.strftime("%b %Y")] = int(round(v, -2))
    crow.append(rec)
costs = pd.DataFrame(crow)
# русские названия месяцев в заголовках: «янв 2023»
RU = {"Jan": "янв", "Feb": "фев", "Mar": "мар", "Apr": "апр", "May": "май", "Jun": "июн",
      "Jul": "июл", "Aug": "авг", "Sep": "сен", "Oct": "окт", "Nov": "ноя", "Dec": "дек"}
costs.columns = [RU.get(c[:3], c[:3]) + c[3:] if c[:3] in RU else c for c in costs.columns]
costs.to_csv(OUT / "3_pony_costs.csv", sep=";", index=False, encoding="utf-8-sig")

# Продажи по дням за 2025 год (крупные позиции): проверка сборки дней в месяцы
days = pd.date_range("2025-01-01", "2025-12-31", freq="D")
top = ["Эль «Гарцующий пони» 0,5", "Лагер «Бри» 0,5", "Рыба и картофель", "Куриные крылья"]
m25 = sales[sales["Месяц"].str.endswith("2025") & sales["Позиция"].isin(top)]
drow = []
for _, r in m25.iterrows():
    mon = int(r["Месяц"][3:5])
    md = days[days.month == mon]
    w = np.array([1.5 if d.weekday() >= 4 else 1.0 for d in md]) * rng.lognormal(0, 0.15, len(md))
    q = np.floor(r["Продано, шт."] * w / w.sum()).astype(int)
    q[-1] += r["Продано, шт."] - q.sum()
    for d, qq in zip(md, q):
        drow.append({"Дата": d.strftime("%Y-%m-%d"), "Позиция": r["Позиция"], "Продано": int(qq), "Выручка": int(qq * r["Цена, руб."])})
pd.DataFrame(drow).to_csv(OUT / "4_pony_daily_2025.csv", index=False, encoding="utf-8-sig")

print(f"Готово: {len(sales)} строк продаж, {len(MENU)} позиций, {N} месяцев → {OUT}")
