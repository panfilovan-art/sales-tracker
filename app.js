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
    return { version: 1, name: "", goals: Object.assign({}, DEFAULT_GOALS), days: {} };
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
  var view = { day: todayKey(), week: mondayOf(todayKey()), tab: "day" };

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
    renderSettings();
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

  // ---------- рабочие дни (data.json обновляется сам по расписанию) ----------
  var MONTHS_NOM = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

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
  showTab("day");
  loadWorkdays();
})();
