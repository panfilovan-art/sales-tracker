"""Собирает производственный календарь РФ и сохраняет его в data.json.

Откуда (открытые данные, без ключей и регистрации):
  1) основной — производственный календарь по данным КонсультантПлюс,
     выложенный на GitHub (github.com/d10xa/holidays-calendar);
  2) запасной — xmlcalendar.ru (серверы GitHub до него часто не достают).
Что сохраняем: для текущего и следующего года — список нерабочих дней
(выходные и праздники) и список сокращённых предпраздничных дней.

Если источник не ответил или прислал что-то странное — старый data.json
остаётся как есть, приложение продолжает работать со старыми данными.

Запуск вручную:  python3 fetch.py
"""

import json
import sys
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

URL_MAIN = "https://raw.githubusercontent.com/d10xa/holidays-calendar/master/json/consultant{year}.json"
URL_SPARE = "https://xmlcalendar.ru/data/ru/{year}/calendar.json"
OUT = Path(__file__).with_name("data.json")
MSK = ZoneInfo("Europe/Moscow")


def download(url, year):
    """Скачивает календарь на год. Возвращает словарь или None, если не вышло."""
    try:
        req = urllib.request.Request(url.format(year=year), headers={"User-Agent": "sales-tracker-calendar"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.load(resp)
    except Exception as err:  # нет сети, 404, битый ответ — всё одно: пропускаем
        print(f"  {year}: источник не ответил ({err})")
        return None


def check(off, short, year):
    """Проверка здравого смысла: даты этого года и хотя бы 104 выходных (52 недели × 2)."""
    if len(off) < 104 or any(not d.startswith(f"{year}-") for d in off + short):
        print(f"  {year}: данные неполные или странные (нерабочих дней {len(off)})")
        return None
    return {"nonworking": sorted(off), "short": sorted(short), "workdays": 365 + (year % 4 == 0) - len(off)}


def parse_main(raw, year):
    """Формат основного источника: {"holidays": [даты], "preholidays": [даты]}."""
    try:
        off = [str(d) for d in raw["holidays"]]
        short = [str(d) for d in raw.get("preholidays", [])]
    except Exception as err:
        print(f"  {year}: непонятный формат ({err})")
        return None
    return check(off, short, year)


def parse_spare(raw, year):
    """Формат xmlcalendar.ru: дни по месяцам, «*» — сокращённый день."""
    try:
        off, short = [], []
        for m in raw["months"]:
            month = int(m["month"])
            for item in m["days"].split(","):
                item = item.strip()
                if not item:
                    continue
                day = int(item.rstrip("*+"))
                date = f"{year}-{month:02d}-{day:02d}"
                # «*» — сокращённый рабочий день; остальные — нерабочие
                (short if item.endswith("*") else off).append(date)
        months = {int(m["month"]) for m in raw["months"]}
    except Exception as err:
        print(f"  {year}: непонятный формат ({err})")
        return None

    if months != set(range(1, 13)):
        print(f"  {year}: не все месяцы ({len(months)})")
        return None
    return check(off, short, year)


def main():
    now = datetime.now(MSK)
    old = {}
    if OUT.exists():
        try:
            old = json.loads(OUT.read_text(encoding="utf-8"))
        except Exception:
            old = {}

    years = {}
    for year in (now.year, now.year + 1):
        data = None
        for url, parse in ((URL_MAIN, parse_main), (URL_SPARE, parse_spare)):
            raw = download(url, year)
            data = parse(raw, year) if raw else None
            if data:
                break
        if data:
            years[str(year)] = data
            print(f"  {year}: ок, рабочих дней {data['workdays']}")
        elif str(year) in old.get("years", {}):
            years[str(year)] = old["years"][str(year)]  # берём прошлые данные
            print(f"  {year}: оставили прежние данные")

    if str(now.year) not in years:
        print("Календарь на текущий год получить не удалось — data.json не трогаем.")
        return 0  # не ошибка: приложение работает со старым файлом

    result = {
        "updated": now.isoformat(timespec="minutes"),
        "source": "Производственный календарь РФ (КонсультантПлюс / xmlcalendar.ru)",
        "years": years,
    }
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Сохранено в {OUT.name}, обновлено {result['updated']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
