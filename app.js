/* Дела продаж — данные хранятся только в браузере (localStorage) */
(function () {
  "use strict";

  var STORAGE_KEY = "sales-tracker-v1";
  var COUNTERS = [
    { key: "calls", name: "Звонки" },
    { key: "kp", name: "КП" },
    { key: "meetings", name: "Встречи" },
    { key: "renewals", name: "Продления" }
  ];
  var DEFAULT_GOALS = { calls: 20, kp: 2, meetings: 1, renewals: 1 };
  var WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  var WEEKDAYS_FULL = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];
  var MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

  // ---------- даты ----------
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function toKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function fromKey(k) { var p = k.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(k, n) { var d = fromKey(k); d.setDate(d.getDate() + n); return toKey(d); }
  function todayKey() { return toKey(new Date()); }
  function ruDate(k) { var d = fromKey(k); return pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "." + d.getFullYear(); }
  function shortDate(k) { var d = fromKey(k); return pad(d.getDate()) + "." + pad(d.getMonth() + 1); }
  function weekdayIndex(k) { return (fromKey(k).getDay() + 6) % 7; } // 0 = понедельник
  function mondayOf(k) { return addDays(k, -weekdayIndex(k)); }

  // ---------- хранилище ----------
  function emptyState() {
    return {
      version: 1, name: "", goals: Object.assign({}, DEFAULT_GOALS), days: {},
      payments: { expected: [], received: [] },
      hints: [] // [{ name: "ООО «Ромашка»", items: ["Продление лицензии", …] }]
    };
  }

  // ---------- оплаты: проверка данных ----------
  function cleanText(v, max) { return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : ""; }
  function cleanMoney(v) {
    var n = typeof v === "number" ? v : parseInt(String(v || "").replace(/[^\d]/g, ""), 10);
    if (isNaN(n) || n <= 0) return 0;
    return Math.min(Math.round(n), 99999999999);
  }
  function isDateKey(v) { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v); }
  function isMonthKey(v) { return typeof v === "string" && /^\d{4}-\d{2}$/.test(v); }

  function normalizePayments(raw, s) {
    var p = raw && raw.payments;
    if (p && Array.isArray(p.expected)) {
      p.expected.forEach(function (e) {
        if (!e || typeof e !== "object") return;
        var item = {
          id: cleanText(e.id, 40) || newId(),
          month: isMonthKey(e.month) ? e.month : (isDateKey(e.due) ? e.due.slice(0, 7) : ""),
          client: cleanText(e.client, 80),
          item: cleanText(e.item, 120),
          amount: cleanMoney(e.amount),
          due: isDateKey(e.due) ? e.due : ""
        };
        if (item.month && item.client && item.amount) s.payments.expected.push(item);
      });
    }
    if (p && Array.isArray(p.received)) {
      p.received.forEach(function (r) {
        if (!r || typeof r !== "object") return;
        var item = {
          id: cleanText(r.id, 40) || newId(),
          date: isDateKey(r.date) ? r.date : "",
          client: cleanText(r.client, 80),
          item: cleanText(r.item, 120),
          amount: cleanMoney(r.amount),
          expectedId: cleanText(r.expectedId, 40)
        };
        if (item.date && item.client && item.amount) s.payments.received.push(item);
      });
    }
    if (Array.isArray(raw && raw.hints)) {
      raw.hints.forEach(function (h) {
        if (!h) return;
        var name = cleanText(h.name, 80);
        if (!name) return;
        var items = Array.isArray(h.items) ? h.items.map(function (i) { return cleanText(i, 120); }).filter(Boolean) : [];
        addHintTo(s.hints, name, null);
        items.forEach(function (i) { addHintTo(s.hints, name, i); });
      });
    }
  }

  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // подсказки: клиент и то, за что он платит
  function sameText(a, b) { return a.toLowerCase().replace(/ё/g, "е") === b.toLowerCase().replace(/ё/g, "е"); }
  function findHint(list, name) {
    for (var i = 0; i < list.length; i++) if (sameText(list[i].name, name)) return list[i];
    return null;
  }
  function addHintTo(list, name, item) {
    var h = findHint(list, name);
    if (!h) { h = { name: name, items: [] }; list.push(h); }
    if (item && !h.items.some(function (x) { return sameText(x, item); })) h.items.unshift(item);
    return h;
  }

  function normalize(raw) {
    var s = emptyState();
    if (!raw || typeof raw !== "object") return s;
    if (typeof raw.name === "string") s.name = raw.name.slice(0, 40);
    if (raw.goals && typeof raw.goals === "object") {
      COUNTERS.forEach(function (c) { s.goals[c.key] = toCount(raw.goals[c.key], DEFAULT_GOALS[c.key]); });
    }
    if (raw.days && typeof raw.days === "object") {
      Object.keys(raw.days).forEach(function (k) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return;
        var d = raw.days[k] || {};
        var day = { note: typeof d.note === "string" ? d.note.slice(0, 300) : "" };
        COUNTERS.forEach(function (c) { day[c.key] = toCount(d[c.key], 0); });
        if (d.goals && typeof d.goals === "object") {
          day.goals = {};
          COUNTERS.forEach(function (c) { day.goals[c.key] = toCount(d.goals[c.key], s.goals[c.key]); });
        }
        s.days[k] = day;
      });
    }
    normalizePayments(raw, s);
    return s;
  }

  function toCount(v, fallback) {
    var n = parseInt(v, 10);
    if (isNaN(n) || n < 0) return fallback;
    return Math.min(n, 9999);
  }

  function load() {
    try {
      var txt = localStorage.getItem(STORAGE_KEY);
      return txt ? normalize(JSON.parse(txt)) : emptyState();
    } catch (e) {
      return emptyState();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      toast("Не получилось сохранить: браузер не даёт доступ к хранилищу");
    }
  }

  var state = load();
  var view = { day: todayKey(), week: mondayOf(todayKey()), month: todayKey().slice(0, 7), tab: "day" };

  // ---------- логика дня ----------
  function getDay(k) { return state.days[k]; }

  function ensureDay(k) {
    if (!state.days[k]) {
      var d = { note: "" };
      COUNTERS.forEach(function (c) { d[c.key] = 0; });
      state.days[k] = d;
    }
    // цели «замораживаются» в дне, чтобы смена цели не меняла прошлое
    if (!state.days[k].goals && k <= todayKey()) state.days[k].goals = Object.assign({}, state.goals);
    return state.days[k];
  }

  function goalsFor(k) {
    var d = getDay(k);
    return (d && d.goals) ? d.goals : state.goals;
  }

  function counterDone(k, key) {
    var d = getDay(k);
    var g = goalsFor(k)[key];
    return !!d && g > 0 && d[key] >= g;
  }

  function dayCounts(k) {
    return COUNTERS.some(function (c) { return counterDone(k, c.key); });
  }

  function isEmptyDay(d) {
    return !d || (!d.note && COUNTERS.every(function (c) { return !d[c.key]; }));
  }

  function streak() {
    var k = todayKey();
    if (!dayCounts(k)) k = addDays(k, -1); // сегодня ещё в процессе — серия не обрывается
    var n = 0;
    while (dayCounts(k) && n < 3660) { n++; k = addDays(k, -1); }
    return n;
  }

  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  // ---------- отчёты ----------
  function lineFor(name, value, goal) {
    if (goal > 0) return name + ": " + value + " из " + goal + (value >= goal ? " ✅" : "");
    return name + ": " + value;
  }

  function dayReport(k) {
    var d = getDay(k) || {};
    var g = goalsFor(k);
    var lines = ["Отчёт за " + ruDate(k) + (state.name ? " — " + state.name : "")];
    COUNTERS.forEach(function (c) { lines.push(lineFor(c.name, d[c.key] || 0, g[c.key])); });
    if (d.note && d.note.trim()) lines.push("Заметка: " + d.note.trim());
    return lines.join("\n");
  }

  function weekReport(mon) {
    var sun = addDays(mon, 6);
    var totals = {}, goalTotals = {}, doneDays = 0;
    COUNTERS.forEach(function (c) { totals[c.key] = 0; goalTotals[c.key] = 0; });
    for (var i = 0; i < 7; i++) {
      var k = addDays(mon, i), d = getDay(k), g = goalsFor(k);
      if (dayCounts(k)) doneDays++;
      COUNTERS.forEach(function (c) {
        totals[c.key] += d ? d[c.key] : 0;
        if (k <= todayKey() || d) goalTotals[c.key] += g[c.key];
      });
    }
    var lines = ["Отчёт за неделю " + shortDate(mon) + "–" + ruDate(sun) + (state.name ? " — " + state.name : "")];
    COUNTERS.forEach(function (c) { lines.push(lineFor(c.name, totals[c.key], goalTotals[c.key])); });
    lines.push("Дней с выполненной целью: " + doneDays + " из 7");
    return lines.join("\n");
  }

  function copyText(text) {
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      return ok;
    }
    var done = function () { toast("Отчёт скопирован — вставьте его в мессенджер"); };
    var fail = function () { toast("Не получилось скопировать. Выделите текст вручную."); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () { fallback() ? done() : fail(); });
    } else {
      fallback() ? done() : fail();
    }
  }

  // ---------- отрисовка ----------
  var $ = function (id) { return document.getElementById(id); };

  function buildCounters() {
    var box = $("counters");
    box.innerHTML = "";
    COUNTERS.forEach(function (c) {
      var el = document.createElement("div");
      el.className = "counter";
      el.dataset.key = c.key;
      el.innerHTML =
        '<button class="round-btn round-btn--minus" data-act="minus" aria-label="' + c.name + ': минус один">−</button>' +
        '<div class="counter__main">' +
          '<div class="counter__name">' + c.name + '</div>' +
          '<div class="counter__value" aria-live="polite">0</div>' +
          '<div class="counter__goal"></div>' +
        '</div>' +
        '<button class="round-btn round-btn--plus" data-act="plus" aria-label="' + c.name + ': плюс один">+</button>' +
        '<div class="bar"><div class="bar__fill"></div></div>';
      box.appendChild(el);
    });
  }

  function renderDay() {
    var k = view.day, t = todayKey();
    var d = getDay(k) || {};
    var g = goalsFor(k);
    var dt = fromKey(k);

    var title = k === t ? "Сегодня" : k === addDays(t, -1) ? "Вчера" : k === addDays(t, 1) ? "Завтра" : WEEKDAYS_FULL[weekdayIndex(k)];
    $("day-title").textContent = title.charAt(0).toUpperCase() + title.slice(1) + (dayCounts(k) ? " ✅" : "");
    $("day-sub").textContent = dt.getDate() + " " + MONTHS[dt.getMonth()] + " " + dt.getFullYear() + (k === t || k === addDays(t, -1) || k === addDays(t, 1) ? ", " + WEEKDAYS_FULL[weekdayIndex(k)] : "");
    $("day-today").hidden = k === t;

    COUNTERS.forEach(function (c) {
      var el = document.querySelector('.counter[data-key="' + c.key + '"]');
      var v = d[c.key] || 0, goal = g[c.key];
      el.querySelector(".counter__value").textContent = v;
      el.querySelector(".counter__goal").textContent = goal > 0 ? "цель " + goal + (v >= goal ? " — выполнено" : "") : "без цели";
      el.querySelector('[data-act="minus"]').disabled = v <= 0;
      var bar = el.querySelector(".bar");
      bar.classList.toggle("bar--none", !(goal > 0));
      el.querySelector(".bar__fill").style.width = goal > 0 ? Math.min(100, Math.round(v / goal * 100)) + "%" : "0";
      el.classList.toggle("is-done", counterDone(k, c.key));
    });

    var noteEl = $("note");
    if (document.activeElement !== noteEl) noteEl.value = d.note || "";

    var s = streak();
    $("streak").textContent = s > 0
      ? "Серия: " + s + " " + plural(s, "день", "дня", "дней") + " подряд"
      : "Серия: пока 0 дней. Выполните цель хотя бы по одному счётчику.";

    var hasAny = Object.keys(state.days).some(function (key) { return !isEmptyDay(state.days[key]); });
    $("hint-empty").hidden = hasAny;
  }

  function renderWeek() {
    var mon = view.week, sun = addDays(mon, 6), t = todayKey();
    $("week-sub").textContent = shortDate(mon) + " – " + ruDate(sun) + (mon === mondayOf(t) ? ", эта неделя" : "");

    var html = "<thead><tr><th scope='col' style='text-align:left;padding-left:12px'>День</th>";
    COUNTERS.forEach(function (c) { html += "<th scope='col'>" + c.name + "</th>"; });
    html += "<th scope='col' class='mark'><span class='visually-hidden'>Цель</span></th></tr></thead><tbody>";

    var totals = {}, anyData = false;
    COUNTERS.forEach(function (c) { totals[c.key] = 0; });
    for (var i = 0; i < 7; i++) {
      var k = addDays(mon, i), d = getDay(k);
      if (!isEmptyDay(d)) anyData = true;
      html += "<tr data-day='" + k + "' class='" + (k === t ? "is-today" : "") + "' title='Открыть этот день'>" +
        "<th scope='row'>" + WEEKDAYS[i] + " <span class='day-date'>" + shortDate(k) + "</span></th>";
      COUNTERS.forEach(function (c) {
        var v = d ? d[c.key] : 0;
        totals[c.key] += v;
        html += "<td class='" + (counterDone(k, c.key) ? "is-done" : "") + "'>" + v + "</td>";
      });
      html += "<td class='mark'>" + (dayCounts(k) ? "✅" : "") + "</td></tr>";
    }
    html += "</tbody><tfoot><tr><th scope='row' style='text-align:left;padding-left:12px'>Итого</th>";
    COUNTERS.forEach(function (c) { html += "<td>" + totals[c.key] + "</td>"; });
    html += "<td class='mark'></td></tr></tfoot>";
    $("week-table").innerHTML = html;
    $("week-empty").hidden = anyData;
  }

  function renderSettings() {
    var nameEl = $("name");
    if (document.activeElement !== nameEl) nameEl.value = state.name;
    var box = $("goals");
    if (!box.children.length) {
      COUNTERS.forEach(function (c) {
        var l = document.createElement("label");
        l.innerHTML = c.name + '<input type="number" inputmode="numeric" min="0" max="9999" step="1" data-goal="' + c.key + '">';
        box.appendChild(l);
      });
    }
    COUNTERS.forEach(function (c) {
      var inp = box.querySelector('[data-goal="' + c.key + '"]');
      if (document.activeElement !== inp) inp.value = state.goals[c.key];
    });
  }

  function render() {
    renderDay();
    renderWeek();
    renderPay();
    renderSettings();
    renderHints();
  }

  function showTab(tab) {
    view.tab = tab;
    document.querySelectorAll(".screen").forEach(function (s) { s.hidden = s.dataset.screen !== tab; });
    document.querySelectorAll(".tab").forEach(function (b) {
      var on = b.dataset.tab === tab;
      b.classList.toggle("is-active", on);
      if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    render();
    window.scrollTo(0, 0);
  }

  var toastTimer;
  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
    el.classList.add("is-shown");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("is-shown"); }, 2600);
  }

  // ---------- события ----------
  function bind() {
    $("counters").addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-act]");
      if (!btn) return;
      var key = btn.closest(".counter").dataset.key;
      var d = ensureDay(view.day);
      d[key] = Math.max(0, Math.min(9999, d[key] + (btn.dataset.act === "plus" ? 1 : -1)));
      save();
      renderDay();
    });

    $("note").addEventListener("input", function (e) {
      ensureDay(view.day).note = e.target.value.slice(0, 300);
      save();
      $("hint-empty").hidden = true;
    });

    $("day-prev").addEventListener("click", function () { view.day = addDays(view.day, -1); renderDay(); });
    $("day-next").addEventListener("click", function () { view.day = addDays(view.day, 1); renderDay(); });
    $("day-today").addEventListener("click", function () { view.day = todayKey(); renderDay(); });

    $("week-prev").addEventListener("click", function () { view.week = addDays(view.week, -7); renderWeek(); });
    $("week-next").addEventListener("click", function () { view.week = addDays(view.week, 7); renderWeek(); });
    $("week-table").addEventListener("click", function (e) {
      var tr = e.target.closest("tr[data-day]");
      if (!tr) return;
      view.day = tr.dataset.day;
      showTab("day");
    });

    $("copy-day").addEventListener("click", function () { copyText(dayReport(view.day)); });
    $("copy-week").addEventListener("click", function () { copyText(weekReport(view.week)); });

    $("name").addEventListener("input", function (e) { state.name = e.target.value.slice(0, 40); save(); });
    $("goals").addEventListener("input", function (e) {
      var key = e.target.dataset.goal;
      if (!key) return;
      state.goals[key] = toCount(e.target.value, 0);
      // сегодняшний день и будущие дни берут новую цель
      var t = todayKey();
      Object.keys(state.days).forEach(function (k) {
        if (k >= t && state.days[k].goals) state.days[k].goals[key] = state.goals[key];
      });
      save();
    });

    $("export").addEventListener("click", function () {
      var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "dela-prodazh-" + todayKey() + ".json";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      toast("Копия скачана");
    });

    $("import-btn").addEventListener("click", function () { $("import").click(); });
    $("import").addEventListener("change", function (e) {
      var file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var parsed;
        try { parsed = JSON.parse(reader.result); } catch (err) { toast("Это не файл копии: не удалось прочитать JSON"); return; }
        if (!parsed || typeof parsed !== "object" || !parsed.days || typeof parsed.days !== "object") {
          toast("В файле нет данных «Дел продаж»");
          return;
        }
        if (!window.confirm("Заменить текущие данные данными из копии?")) return;
        state = normalize(parsed);
        save();
        render();
        toast("Копия загружена");
      };
      reader.readAsText(file);
    });

    $("clear").addEventListener("click", function () {
      if (!window.confirm("Точно удалить? Все отметки, заметки, цели и имя пропадут из этого браузера.")) return;
      state = emptyState();
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ничего */ }
      view.day = todayKey();
      view.week = mondayOf(todayKey());
      view.month = todayKey().slice(0, 7);
      closePayForm();
      render();
      toast("Все данные удалены");
    });

    document.querySelectorAll(".tab").forEach(function (b) {
      b.addEventListener("click", function () { showTab(b.dataset.tab); });
    });

    // данные поменялись в другой вкладке
    window.addEventListener("storage", function (e) {
      if (e.key === STORAGE_KEY) { state = load(); render(); }
    });
  }

  // ---------- оплаты ----------
  function money(n) { return Math.round(n).toLocaleString("ru-RU").replace(/ | /g, " ") + " ₽"; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function addMonths(m, n) {
    var y = +m.slice(0, 4), mo = +m.slice(5) - 1 + n;
    var d = new Date(y, mo, 1);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1);
  }
  function monthName(m) { var n = MONTHS_NOM[+m.slice(5) - 1]; return n + " " + m.slice(0, 4); }
  function monthNameCap(m) { var n = monthName(m); return n.charAt(0).toUpperCase() + n.slice(1); }
  // «в ноябре»
  var MONTHS_IN = ["январе", "феврале", "марте", "апреле", "мае", "июне", "июле", "августе", "сентябре", "октябре", "ноябре", "декабре"];

  function sumReceived(from, to) { // включительно, ключи дат
    return state.payments.received.reduce(function (s, r) { return r.date >= from && r.date <= to ? s + r.amount : s; }, 0);
  }
  function receivedFor(expId) {
    return state.payments.received.reduce(function (s, r) { return r.expectedId === expId ? s + r.amount : s; }, 0);
  }
  function expectedIn(m) { return state.payments.expected.filter(function (e) { return e.month === m; }); }
  function receivedIn(m) {
    return state.payments.received.filter(function (r) { return r.date.slice(0, 7) === m; })
      .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  }
  function lastDayOf(m) { var d = new Date(+m.slice(0, 4), +m.slice(5), 0); return toKey(d); }

  // цвет полоски плавно меняется: красный → жёлтый → зелёный
  function planColor(p) {
    var stops = [[216, 64, 74], [224, 161, 0], [35, 133, 90]]; // красный, жёлтый, зелёный
    p = Math.max(0, Math.min(1, p));
    var a = p < 0.5 ? stops[0] : stops[1], b = p < 0.5 ? stops[1] : stops[2], k = p < 0.5 ? p * 2 : (p - 0.5) * 2;
    return "rgb(" + a.map(function (v, i) { return Math.round(v + (b[i] - v) * k); }).join(", ") + ")";
  }

  function renderPay() {
    var m = view.month, t = todayKey(), cur = t.slice(0, 7);
    $("month-sub").textContent = monthName(m) + (m === cur ? ", этот месяц" : "");
    $("month-now").hidden = m === cur;

    $("sum-day").textContent = money(sumReceived(t, t));
    $("sum-week").textContent = money(sumReceived(mondayOf(t), addDays(mondayOf(t), 6)));
    $("sum-month-label").textContent = monthNameCap(m).split(" ")[0];
    var got = sumReceived(m + "-01", lastDayOf(m));
    $("sum-month").textContent = money(got);

    // план = все ожидаемые оплаты месяца
    var exp = expectedIn(m);
    var plan = exp.reduce(function (s, e) { return s + e.amount; }, 0);
    var fill = $("plan-fill");
    if (plan > 0) {
      var p = got / plan, pct = Math.round(p * 100);
      $("plan-text").innerHTML = "Поступило <strong>" + money(got) + "</strong> из " + money(plan);
      $("plan-pct").textContent = pct + "%";
      fill.style.width = Math.min(100, p * 100) + "%";
      fill.style.background = planColor(p);
      var left = Math.max(0, plan - got);
      $("plan-note").textContent = left > 0 ? "Осталось получить " + money(left) : "План месяца выполнен 🎉";
    } else {
      $("plan-text").innerHTML = "Поступило <strong>" + money(got) + "</strong>";
      $("plan-pct").textContent = "";
      fill.style.width = "0";
      $("plan-note").textContent = "Добавьте, кто оплатит в этом месяце — полоска покажет, сколько из плана уже пришло.";
    }

    // список «Ждём оплату»
    var mIn = MONTHS_IN[+m.slice(5) - 1];
    $("exp-title").textContent = "Ждём оплату в " + mIn;
    var sorted = exp.slice().sort(function (a, b) {
      var pa = receivedFor(a.id) >= a.amount, pb = receivedFor(b.id) >= b.amount;
      if (pa !== pb) return pa ? 1 : -1;
      return (a.due || "9999") < (b.due || "9999") ? -1 : (a.due || "9999") > (b.due || "9999") ? 1 : 0;
    });
    $("exp-list").innerHTML = sorted.map(function (e) {
      var r = receivedFor(e.id), paid = r >= e.amount;
      var overdue = !paid && e.due && e.due < t;
      var sub = esc(e.item) + (e.due ? " · до " + shortDate(e.due) : "");
      var status = paid
        ? "<span class='pill pill--done'>оплачено</span>"
        : (r > 0 ? "<span class='pill pill--part'>пришло " + money(r) + "</span>" : "") +
          "<button type='button' class='pay-btn' data-act='paid' data-id='" + esc(e.id) + "'>Пришла</button>";
      return "<li class='payrow" + (paid ? " is-paid" : "") + (overdue ? " is-overdue" : "") + "'>" +
        "<div class='payrow__main'><div class='payrow__client'>" + esc(e.client) + "</div>" +
        "<div class='payrow__sub'>" + sub + (overdue ? " · <b>срок прошёл</b>" : "") + "</div></div>" +
        "<div class='payrow__side'><div class='payrow__sum'>" + money(e.amount) + "</div>" + status + "</div>" +
        "<button type='button' class='del-btn' data-act='del-exp' data-id='" + esc(e.id) + "' aria-label='Удалить: " + esc(e.client) + "'>×</button>" +
        "</li>";
    }).join("");
    $("exp-empty").hidden = exp.length > 0;

    // список «Поступило»
    var rec = receivedIn(m);
    $("rec-title").textContent = "Поступило в " + mIn;
    $("rec-list").innerHTML = rec.map(function (r) {
      return "<li class='payrow'>" +
        "<div class='payrow__main'><div class='payrow__client'>" + esc(r.client) + "</div>" +
        "<div class='payrow__sub'>" + esc(r.item) + " · " + shortDate(r.date) + "</div></div>" +
        "<div class='payrow__side'><span class='pill pill--done pill--sum'>" + money(r.amount) + "</span></div>" +
        "<button type='button' class='del-btn' data-act='del-rec' data-id='" + esc(r.id) + "' aria-label='Удалить поступление: " + esc(r.client) + "'>×</button>" +
        "</li>";
    }).join("");
    $("rec-empty").hidden = rec.length > 0;
  }

  function monthReport(m) {
    var exp = expectedIn(m), rec = receivedIn(m).slice().reverse();
    var plan = exp.reduce(function (s, e) { return s + e.amount; }, 0);
    var got = rec.reduce(function (s, r) { return s + r.amount; }, 0);
    var lines = ["Оплаты за " + monthName(m) + (state.name ? " — " + state.name : "")];
    lines.push("Поступило: " + money(got) + (plan > 0 ? " из " + money(plan) + " (" + Math.round(got / plan * 100) + "%)" : ""));
    if (rec.length) {
      lines.push("", "Пришло:");
      rec.forEach(function (r) { lines.push("— " + r.client + ", " + r.item + " — " + money(r.amount) + " (" + shortDate(r.date) + ")"); });
    }
    var waiting = exp.filter(function (e) { return receivedFor(e.id) < e.amount; });
    if (waiting.length) {
      lines.push("", "Ждём:");
      waiting.forEach(function (e) {
        var left = e.amount - receivedFor(e.id);
        lines.push("— " + e.client + ", " + e.item + " — " + money(left) + (e.due ? " (до " + shortDate(e.due) + ")" : ""));
      });
    }
    return lines.join("\n");
  }

  // ----- форма оплаты -----
  var form = { mode: "expected", expectedId: "" };

  function fillClientList() {
    $("dl-clients").innerHTML = state.hints.map(function (h) { return "<option value='" + esc(h.name) + "'>"; }).join("");
  }
  function fillItemList() {
    var client = cleanText($("pf-client").value, 80);
    var h = client ? findHint(state.hints, client) : null;
    var own = h ? h.items : [];
    var all = own.slice();
    state.hints.forEach(function (x) {
      x.items.forEach(function (i) { if (!all.some(function (a) { return sameText(a, i); })) all.push(i); });
    });
    $("dl-items").innerHTML = all.map(function (i) { return "<option value='" + esc(i) + "'>"; }).join("");
    var hint = $("pf-item-hint");
    if (own.length) {
      hint.textContent = "Раньше платил за: " + own.slice(0, 3).join(" · ");
      hint.hidden = false;
    } else {
      hint.hidden = true;
    }
  }

  function openPayForm(mode, exp) {
    form.mode = mode;
    form.expectedId = exp ? exp.id : "";
    var t = todayKey();
    $("payform-title").textContent = mode === "expected" ? "Ждём оплату" : (exp ? "Пришла оплата от клиента" : "Пришла оплата");
    $("pf-date-label").textContent = mode === "expected" ? "Ждём до (можно не указывать)" : "Дата поступления";
    $("pf-client").value = exp ? exp.client : "";
    $("pf-item").value = exp ? exp.item : "";
    $("pf-amount").value = exp ? String(Math.max(0, exp.amount - receivedFor(exp.id))).replace(/\B(?=(\d{3})+(?!\d))/g, " ") : "";
    if (mode === "expected") {
      $("pf-date").value = "";
      $("pf-date").min = view.month + "-01";
      $("pf-date").max = lastDayOf(view.month);
    } else {
      $("pf-date").value = t;
      $("pf-date").removeAttribute("min");
      $("pf-date").removeAttribute("max");
    }
    $("pf-error").hidden = true;
    fillClientList();
    fillItemList();
    $("payform").hidden = false;
    $("payform").scrollIntoView({ behavior: "smooth", block: "start" });
    (exp ? $("pf-amount") : $("pf-client")).focus({ preventScroll: true });
  }

  function closePayForm() {
    $("payform").hidden = true;
    form.expectedId = "";
  }

  function payError(msg, field) {
    var el = $("pf-error");
    el.textContent = msg;
    el.hidden = false;
    if (field) $(field).focus();
  }

  function savePayForm() {
    var client = cleanText($("pf-client").value, 80);
    var item = cleanText($("pf-item").value, 120);
    var amount = cleanMoney($("pf-amount").value);
    var date = $("pf-date").value;
    if (!client) return payError("Напишите название клиента", "pf-client");
    if (!item) return payError("Напишите, за что оплата", "pf-item");
    if (!amount) return payError("Укажите сумму больше нуля", "pf-amount");

    // если клиент уже есть в подсказках — берём его написание
    var known = findHint(state.hints, client);
    if (known) client = known.name;

    if (form.mode === "expected") {
      if (date && !isDateKey(date)) return payError("Проверьте дату", "pf-date");
      state.payments.expected.push({
        id: newId(), month: date ? date.slice(0, 7) : view.month,
        client: client, item: item, amount: amount, due: date || ""
      });
      toast("Записано: ждём " + money(amount));
    } else {
      if (!isDateKey(date)) return payError("Укажите дату поступления", "pf-date");
      state.payments.received.push({
        id: newId(), date: date, client: client, item: item, amount: amount, expectedId: form.expectedId
      });
      toast("Поступление записано: " + money(amount));
      if (date.slice(0, 7) !== view.month && !form.expectedId) view.month = date.slice(0, 7);
    }
    addHintTo(state.hints, client, item);
    save();
    closePayForm();
    renderPay();
    renderHints();
  }

  function renderHints() {
    var box = $("hint-list");
    if (!state.hints.length) {
      box.innerHTML = "<li class='muted small'>Пока пусто — клиенты появятся здесь, когда Вы запишете первую оплату.</li>";
      return;
    }
    box.innerHTML = state.hints.slice().sort(function (a, b) { return a.name.localeCompare(b.name, "ru"); }).map(function (h) {
      return "<li><div><div class='payrow__client'>" + esc(h.name) + "</div>" +
        (h.items.length ? "<div class='payrow__sub'>" + h.items.map(esc).join(" · ") + "</div>" : "") +
        "</div><button type='button' class='del-btn' data-name='" + esc(h.name) + "' aria-label='Удалить подсказку: " + esc(h.name) + "'>×</button></li>";
    }).join("");
  }

  function bindPay() {
    $("month-prev").addEventListener("click", function () { view.month = addMonths(view.month, -1); closePayForm(); renderPay(); });
    $("month-next").addEventListener("click", function () { view.month = addMonths(view.month, 1); closePayForm(); renderPay(); });
    $("month-now").addEventListener("click", function () { view.month = todayKey().slice(0, 7); closePayForm(); renderPay(); });

    $("add-expected").addEventListener("click", function () { openPayForm("expected", null); });
    $("add-received").addEventListener("click", function () { openPayForm("received", null); });
    $("pf-cancel").addEventListener("click", closePayForm);
    $("payform").addEventListener("submit", function (e) { e.preventDefault(); savePayForm(); });
    $("pf-client").addEventListener("input", function () { fillItemList(); $("pf-error").hidden = true; });
    ["pf-item", "pf-amount", "pf-date"].forEach(function (id) {
      $(id).addEventListener("input", function () { $("pf-error").hidden = true; });
    });
    // сумма с пробелами между тысячами
    $("pf-amount").addEventListener("blur", function (e) {
      var n = cleanMoney(e.target.value);
      e.target.value = n ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ") : "";
    });

    $("exp-list").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-act]");
      if (!b) return;
      var exp = state.payments.expected.filter(function (x) { return x.id === b.dataset.id; })[0];
      if (!exp) return;
      if (b.dataset.act === "paid") openPayForm("received", exp);
      if (b.dataset.act === "del-exp") {
        if (!window.confirm("Удалить «" + exp.client + "» из списка ожидаемых оплат? Уже записанные поступления останутся.")) return;
        state.payments.expected = state.payments.expected.filter(function (x) { return x.id !== exp.id; });
        state.payments.received.forEach(function (r) { if (r.expectedId === exp.id) r.expectedId = ""; });
        save();
        renderPay();
      }
    });
    $("rec-list").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-act='del-rec']");
      if (!b) return;
      var rec = state.payments.received.filter(function (x) { return x.id === b.dataset.id; })[0];
      if (!rec) return;
      if (!window.confirm("Удалить поступление " + money(rec.amount) + " от «" + rec.client + "»?")) return;
      state.payments.received = state.payments.received.filter(function (x) { return x.id !== rec.id; });
      save();
      renderPay();
    });
    $("hint-list").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-name]");
      if (!b) return;
      if (!window.confirm("Убрать «" + b.dataset.name + "» из подсказок? Оплаты этого клиента останутся.")) return;
      state.hints = state.hints.filter(function (h) { return h.name !== b.dataset.name; });
      save();
      renderHints();
    });
    $("copy-month").addEventListener("click", function () { copyText(monthReport(view.month)); });
  }

  // ---------- рабочие дни (data.json обновляется сам по расписанию) ----------
  var MONTHS_NOM =["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

  function renderWorkdays(data) {
    var main = $("workdays-main"), extra = $("workdays-extra"), upd = $("workdays-updated");
    var box = $("workdays");
    var t = todayKey(), year = t.slice(0, 4), month = t.slice(0, 7);
    var cal = data && data.years && data.years[year];
    if (!cal || !Array.isArray(cal.nonworking)) {
      box.classList.add("is-error");
      main.textContent = data
        ? "Календарь на " + year + " год пока не загружен. Счётчики работают как обычно."
        : "Не удалось загрузить календарь рабочих дней. Проверьте интернет — счётчики работают как обычно.";
      extra.hidden = true;
      upd.hidden = true;
      return;
    }
    box.classList.remove("is-error");
    var off = {}, short = {};
    Object.keys(data.years).forEach(function (y) {  // все годы: чтобы видеть выходные и после Нового года
      (data.years[y].nonworking || []).forEach(function (k) { off[k] = true; });
      (data.years[y].short || []).forEach(function (k) { short[k] = true; });
    });

    // рабочие дни этого месяца: всего и сколько осталось (включая сегодня)
    var total = 0, left = 0, k = month + "-01";
    while (k.slice(0, 7) === month) {
      if (!off[k]) { total++; if (k >= t) left++; }
      k = addDays(k, 1);
    }
    var mName = MONTHS_NOM[+month.slice(5) - 1];
    main.innerHTML = "<strong>" + mName.charAt(0).toUpperCase() + mName.slice(1) + ":</strong> осталось " +
      left + " " + plural(left, "рабочий день", "рабочих дня", "рабочих дней") + " из " + total +
      (off[t] ? " · сегодня выходной" : "");

    // ближайший выходной и ближайший сокращённый день (в пределах 2 месяцев)
    var notes = [], nextOff = null, nextShort = null;
    for (var i = 1; i <= 60 && (!nextOff || !nextShort); i++) {
      var d = addDays(t, i);
      if (!nextOff && off[d]) nextOff = d;
      if (!nextShort && short[d]) nextShort = d;
    }
    function nice(key) { var dt = fromKey(key); return WEEKDAYS_FULL[weekdayIndex(key)] + ", " + dt.getDate() + " " + MONTHS[dt.getMonth()]; }
    if (nextOff) notes.push("Ближайший выходной — " + nice(nextOff));
    if (nextShort) notes.push("сокращённый день — " + nice(nextShort));
    extra.textContent = notes.join("; ");
    extra.hidden = !notes.length;

    // «обновлено …»
    var u = new Date(data.updated);
    if (!isNaN(u)) {
      var days = Math.floor((Date.now() - u.getTime()) / 86400000);
      upd.textContent = "Обновлено " + pad(u.getDate()) + "." + pad(u.getMonth() + 1) + "." + u.getFullYear() +
        " в " + pad(u.getHours()) + ":" + pad(u.getMinutes()) + (days >= 3 ? " — давно не обновлялось" : "");
      upd.hidden = false;
    } else {
      upd.hidden = true;
    }
  }

  function loadWorkdays() {
    fetch("data.json", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(renderWorkdays)
      .catch(function () { renderWorkdays(null); });
  }

  buildCounters();
  bind();
  bindPay();
  showTab("day");
  loadWorkdays();
})();
