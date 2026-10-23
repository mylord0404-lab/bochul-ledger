/* 보철 수납 장부 — 오프라인 PWA. 데이터는 localStorage에만 저장됩니다. */
(function () {
  'use strict';

  var APP_VERSION = '1.0.0';
  var STORE_KEY = 'prosthetic-ledger.v1';
  var PREV_KEY = 'prosthetic-ledger.v1.before-restore';
  var META_KEY = 'prosthetic-ledger.meta';
  var METHODS = ['카드', '현금', '이체'];
  var WEEK = ['일', '월', '화', '수', '목', '금', '토'];

  /* ---------- 유틸 ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return ymd(new Date()); }
  function parseYmd(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) { var d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
  function ym(s) { return s.slice(0, 7); }
  function addMonths(m, n) { var p = m.split('-'); var d = new Date(+p[0], +p[1] - 1 + n, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function isYmd(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parseYmd(s)); }
  function fmtDateK(s) { var d = parseYmd(s); return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + WEEK[d.getDay()] + ')'; }
  function fmtDateFull(s) { var d = parseYmd(s); return d.getFullYear() + '년 ' + fmtDateK(s); }
  function fmtDateS(s) { var d = parseYmd(s); return (d.getMonth() + 1) + '/' + d.getDate() + ' (' + WEEK[d.getDay()] + ')'; }
  function fmtDateDot(s) { var d = parseYmd(s); return d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate() + ' (' + WEEK[d.getDay()] + ')'; }
  function fmtMonthS(m) { var p = m.split('-'); return p[0] + '.' + p[1]; }
  function fmtMonthK(m) { var p = m.split('-'); return p[0] + '년 ' + (+p[1]) + '월'; }
  function comma(n) {
    n = Math.round(Number(n) || 0);
    var neg = n < 0; var s = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + s;
  }
  function won(n) { return comma(n) + '원'; }
  function parseMoney(s) { var d = String(s == null ? '' : s).replace(/[^0-9]/g, ''); return d ? parseInt(d.slice(0, 12), 10) : 0; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
  function norm(s) { return String(s || '').replace(/\s+/g, '').toLowerCase(); }

  /* ---------- 저장소 ---------- */
  var db = { version: 1, records: [] };
  var meta = {};

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var o = JSON.parse(raw);
        db.records = (o.records || []).map(normalizeRecord).filter(Boolean);
      }
    } catch (e) { console.error(e); toast('저장된 데이터를 읽지 못했습니다.'); }
    try { meta = JSON.parse(localStorage.getItem(META_KEY) || '{}') || {}; } catch (e) { meta = {}; }
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), records: db.records }));
      return true;
    } catch (e) {
      console.error(e); alert('저장에 실패했습니다. 저장 공간이 부족할 수 있습니다. 백업 후 다시 시도하세요.');
      return false;
    }
  }
  function saveMeta() { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) {} }

  function normalizePayment(p) {
    if (!p || typeof p !== 'object') return null;
    var amount = Math.round(Number(p.amount));
    if (!isFinite(amount) || amount <= 0) return null;
    return {
      id: typeof p.id === 'string' && p.id ? p.id : uid(),
      date: isYmd(p.date) ? p.date : null,
      amount: amount,
      method: METHODS.indexOf(p.method) >= 0 ? p.method : ''
    };
  }
  function normalizeRecord(r) {
    if (!r || typeof r !== 'object') return null;
    var date = isYmd(r.date) ? r.date : null;
    var name = String(r.name || '').trim();
    if (!date || !name) return null;
    var total = Math.round(Number(r.total));
    if (!isFinite(total) || total < 0) total = 0;
    var pays = (Array.isArray(r.payments) ? r.payments : []).map(normalizePayment).filter(Boolean);
    pays.forEach(function (p) { if (!p.date) p.date = date; });
    sortPays(pays);
    return {
      id: typeof r.id === 'string' && r.id ? r.id : uid(),
      date: date, name: name.slice(0, 40), memo: String(r.memo || '').trim().slice(0, 80),
      total: total, payments: pays,
      createdAt: r.createdAt || new Date().toISOString(), updatedAt: r.updatedAt || r.createdAt || new Date().toISOString()
    };
  }
  function sortPays(p) { p.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }); }
  function paid(r) { return r.payments.reduce(function (s, p) { return s + p.amount; }, 0); }
  function balance(r) { return r.total - paid(r); }
  function findRec(id) { for (var i = 0; i < db.records.length; i++) if (db.records[i].id === id) return db.records[i]; return null; }
  function byDateAsc(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt < b.createdAt ? -1 : 1); }
  function byDateDesc(a, b) { return -byDateAsc(a, b); }

  /* ---------- 공통 UI ---------- */
  var toastTimer;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  function statusPill(r) {
    var b = balance(r);
    if (b > 0) return '<span class="pill due">미수 ' + comma(b) + '</span>';
    if (b < 0) return '<span class="pill over">초과 ' + comma(-b) + '</span>';
    return '<span class="pill done">완납</span>';
  }
  function itemHtml(r, opts) {
    opts = opts || {};
    return '<button type="button" class="item" data-open="' + esc(r.id) + '">' +
      '<div class="item-top"><span class="item-name">' + esc(r.name) + '</span>' +
      (opts.showDate ? '<span class="item-date">' + fmtDateFull(r.date) + '</span>' : statusPill(r)) + '</div>' +
      (r.memo ? '<div class="item-memo">' + esc(r.memo) + '</div>' : '') +
      '<div class="item-money"><span>치료비 <b>' + comma(r.total) + '</b></span><span>수납 <b>' + comma(paid(r)) + '</b></span>' +
      (opts.showDate ? statusPill(r) : '<span>미수 <b>' + comma(Math.max(0, balance(r))) + '</b></span>') + '</div></button>';
  }
  function statHtml(k, v, cls, unit) {
    return '<div class="stat ' + (cls || '') + '"><div class="k">' + k + '</div><div class="v">' + v + (unit === false ? '' : '<small>원</small>') + '</div></div>';
  }
  function emptyHtml(msg) { return '<div class="empty">' + msg + '</div>'; }

  /* 금액 입력: 실시간 콤마 */
  function bindMoney(input) {
    input.addEventListener('input', function () {
      var el = input, pos = el.selectionStart == null ? el.value.length : el.selectionStart;
      var digitsBefore = el.value.slice(0, pos).replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '').length;
      var digits = el.value.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '').slice(0, 12);
      var out = digits ? comma(parseInt(digits, 10)) : '';
      el.value = out;
      var i = 0, seen = 0;
      while (i < out.length && seen < digitsBefore) { if (/\d/.test(out[i])) seen++; i++; }
      try { if (document.activeElement === el) el.setSelectionRange(i, i); } catch (e) {}
    });
  }
  function setMoney(input, n) { input.value = n ? comma(n) : ''; }
  function getRadio(root, name) { var c = $('input[name="' + name + '"]:checked', root); return c ? c.value : ''; }
  function setRadio(root, name, v) { $all('input[name="' + name + '"]', root).forEach(function (i) { i.checked = i.value === (v || ''); }); }
  function methodSeg(name, v) {
    return '<div class="seg" role="radiogroup">' + METHODS.concat(['']).map(function (m) {
      return '<label><input type="radio" name="' + name + '" value="' + m + '"' + ((v || '') === m ? ' checked' : '') + '><span>' + (m || '미지정') + '</span></label>';
    }).join('') + '</div>';
  }

  /* ---------- 탭 이동 ---------- */
  var state = { view: 'add', day: today(), month: ym(today()), q: '', lastToday: today() };

  function go(view) {
    state.view = view;
    $all('.view').forEach(function (v) { v.hidden = v.dataset.view !== view; });
    $all('.tab').forEach(function (t) { if (t.dataset.tab === view) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); });
    $('#btn-menu').setAttribute('aria-pressed', view === 'menu' ? 'true' : 'false');
    render();
    window.scrollTo(0, 0);
  }
  function render() {
    renderBadge(); renderNames();
    switch (state.view) {
      case 'add': renderAdd(); break;
      case 'day': renderDay(); break;
      case 'month': renderMonth(); break;
      case 'unpaid': renderUnpaid(); break;
      case 'search': renderSearch(); break;
      case 'menu': renderMenu(); break;
    }
  }
  function renderBadge() {
    var n = db.records.filter(function (r) { return balance(r) > 0; }).length;
    var b = $('#unpaid-badge'); b.hidden = !n; b.textContent = n > 99 ? '99+' : n;
  }
  var lastNamesKey = '';
  function renderNames() {
    var seen = {}, names = [];
    db.records.slice().sort(byDateDesc).forEach(function (r) { if (!seen[r.name]) { seen[r.name] = 1; names.push(r.name); } });
    var key = names.join('\u0001'); if (key === lastNamesKey) return; lastNamesKey = key;
    $('#names-list').innerHTML = names.slice(0, 300).map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
  }

  /* ---------- 입력 화면 ---------- */
  var addForm = $('#form-add');
  function initAdd() {
    $('#add-date').value = today();
    setRadio(addForm, 'method', meta.lastMethod != null ? meta.lastMethod : '카드');
    bindMoney($('#add-total')); bindMoney($('#add-pay'));
    ['#add-total', '#add-pay'].forEach(function (s) { $(s).addEventListener('input', updatePreview); });
    $('#add-date').addEventListener('change', function () { renderAdd(); });
    $('#add-name').addEventListener('input', updateNameHint);
    $('#btn-fullpay').addEventListener('click', function () { setMoney($('#add-pay'), parseMoney($('#add-total').value)); updatePreview(); });
    addForm.addEventListener('submit', function (e) { e.preventDefault(); submitAdd(); });
  }
  function updatePreview() {
    var t = parseMoney($('#add-total').value), p = parseMoney($('#add-pay').value);
    var el = $('#add-preview');
    if (!t && !p) { el.innerHTML = ''; return; }
    var b = t - p;
    el.innerHTML = b > 0 ? '저장 후 미수금: <b>' + won(b) + '</b>' : b === 0 ? '완납으로 저장됩니다.' : '<b style="color:var(--danger)">수납액이 치료비보다 ' + won(-b) + ' 많습니다.</b>';
  }
  function updateNameHint() {
    var n = norm($('#add-name').value), box = $('#add-name-hint');
    if (!n) { box.hidden = true; return; }
    var due = db.records.filter(function (r) { return norm(r.name) === n && balance(r) > 0; }).sort(byDateAsc);
    if (!due.length) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = '<b>' + esc(due[0].name) + '</b> 님은 미수금이 있는 기록이 ' + due.length + '건 있습니다. 분할 납부라면 새로 입력하지 말고 기존 기록에 수납을 추가하세요.<div class="row-gap" style="flex-wrap:wrap">' +
      due.slice(0, 3).map(function (r) { return '<button type="button" class="btn btn-soft btn-sm" data-open="' + esc(r.id) + '">' + fmtDateK(r.date) + (r.memo ? ' · ' + esc(r.memo) : '') + ' (미수 ' + comma(balance(r)) + ')</button>'; }).join('') + '</div>';
  }
  function submitAdd() {
    var date = $('#add-date').value, name = $('#add-name').value.trim(), memo = $('#add-memo').value.trim();
    var totalStr = $('#add-total').value.trim(), total = parseMoney(totalStr), pay = parseMoney($('#add-pay').value), method = getRadio(addForm, 'method');
    if (!isYmd(date)) { toast('날짜를 선택하세요.'); $('#add-date').focus(); return; }
    if (!name) { toast('환자 이름을 입력하세요.'); $('#add-name').focus(); return; }
    if (!totalStr) { toast('전체 치료비를 입력하세요.'); $('#add-total').focus(); return; }
    if (pay > total && !confirm('수납액(' + won(pay) + ')이 치료비(' + won(total) + ')보다 많습니다. 그대로 저장할까요?')) return;
    var now = new Date().toISOString();
    var rec = { id: uid(), date: date, name: name, memo: memo, total: total, payments: [], createdAt: now, updatedAt: now };
    if (pay > 0) rec.payments.push({ id: uid(), date: date, amount: pay, method: method });
    db.records.push(rec);
    if (!save()) { db.records.pop(); return; }
    meta.lastMethod = method; saveMeta();
    $('#add-name').value = ''; $('#add-memo').value = ''; setMoney($('#add-total'), 0); setMoney($('#add-pay'), 0);
    $('#add-name-hint').hidden = true; updatePreview();
    toast(name + ' 님 기록을 저장했습니다.');
    render();
    $('#add-name').blur(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }
  function renderAdd() {
    var d = $('#add-date').value || today();
    $('#add-list-title').textContent = (d === today() ? '오늘' : fmtDateK(d)) + ' 입력한 기록';
    var list = db.records.filter(function (r) { return r.date === d; }).sort(byDateDesc);
    renderBackupReminder();
    $('#add-list').innerHTML = list.length ? list.map(function (r) { return itemHtml(r); }).join('') : emptyHtml('아직 기록이 없습니다.');
  }

  function renderBackupReminder() {
    var el = $('#backup-reminder'); if (!el) return;
    var lb = meta.lastBackup ? new Date(meta.lastBackup) : null;
    var days = lb ? Math.floor((Date.now() - lb) / 864e5) : null;
    var need = db.records.length >= 5 && (days === null || days >= 14);
    el.hidden = !need;
    if (need) el.innerHTML = (days === null ? '아직 백업한 적이 없습니다.' : '마지막 백업이 ' + days + '일 전입니다.') + ' <a href="#" data-goto="menu">지금 백업하기</a>';
  }

  /* ---------- 일별 ---------- */
  function initDay() {
    $('#day-prev').addEventListener('click', function () { state.day = addDays(state.day, -1); renderDay(); });
    $('#day-next').addEventListener('click', function () { state.day = addDays(state.day, 1); renderDay(); });
    $('#day-today').addEventListener('click', function () { state.day = today(); renderDay(); });
    $('#day-date').addEventListener('change', function () { if (isYmd(this.value)) { state.day = this.value; renderDay(); } });
    $('#day-add').addEventListener('click', function () { $('#add-date').value = state.day; go('add'); $('#add-name').focus(); });
  }
  function dayData(d) {
    var recs = db.records.filter(function (r) { return r.date === d; }).sort(byDateAsc);
    var feeSum = 0, dueSum = 0, paySum = 0, payCount = 0, other = [];
    recs.forEach(function (r) { feeSum += r.total; dueSum += Math.max(0, balance(r)); });
    db.records.forEach(function (r) {
      r.payments.forEach(function (p) {
        if (p.date !== d) return;
        paySum += p.amount; payCount++;
        if (r.date !== d) other.push({ r: r, p: p });
      });
    });
    return { recs: recs, feeSum: feeSum, paySum: paySum, dueSum: dueSum, payCount: payCount, other: other };
  }
  function renderDay() {
    var d = state.day, x = dayData(d);
    $('#day-label').textContent = fmtDateFull(d) + (d === today() ? ' · 오늘' : '');
    $('#day-date').value = d;
    $('#day-today').hidden = d === today();
    $('#day-stats').innerHTML = statHtml('치료비 합계', comma(x.feeSum)) + statHtml('수납 합계', comma(x.paySum), 'paid') + statHtml('미수 합계', comma(x.dueSum), x.dueSum ? 'pos' : '') +
      '<div class="stat-sub">진료 ' + x.recs.length + '건 · 수납 ' + x.payCount + '건</div>';
    $('#day-list').innerHTML = x.recs.length ? x.recs.map(function (r) { return itemHtml(r); }).join('') : emptyHtml('이 날짜의 진료 기록이 없습니다.');
    $('#day-other-wrap').hidden = !x.other.length;
    $('#day-other').innerHTML = x.other.map(function (o) {
      return '<button type="button" class="item" data-open="' + esc(o.r.id) + '"><div class="item-top"><span class="item-name">' + esc(o.r.name) + '</span><b>' + won(o.p.amount) + '</b></div>' +
        '<div class="item-memo">진료일 ' + fmtDateFull(o.r.date) + (o.r.memo ? ' · ' + esc(o.r.memo) : '') + (o.p.method ? ' · ' + o.p.method : '') + '</div></button>';
    }).join('');
  }

  /* ---------- 월별 ---------- */
  function initMonth() {
    $('#month-prev').addEventListener('click', function () { state.month = addMonths(state.month, -1); renderMonth(); });
    $('#month-next').addEventListener('click', function () { state.month = addMonths(state.month, 1); renderMonth(); });
    $('#month-date').addEventListener('change', function () { if (/^\d{4}-\d{2}$/.test(this.value)) { state.month = this.value; renderMonth(); } });
    $('#month-table').addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-day]'); if (!tr) return; state.day = tr.dataset.day; go('day');
    });
    $('#year-table').addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-month]'); if (!tr) return; state.month = tr.dataset.month; renderMonth(); window.scrollTo(0, 0);
    });
  }
  function monthAgg(m) {
    var days = {}, t = { fee: 0, pay: 0, due: 0, n: 0 };
    function day(d) { return days[d] || (days[d] = { fee: 0, pay: 0, due: 0, n: 0 }); }
    db.records.forEach(function (r) {
      if (ym(r.date) === m) { var o = day(r.date), b = Math.max(0, balance(r)); o.fee += r.total; o.due += b; o.n++; t.fee += r.total; t.due += b; t.n++; }
      r.payments.forEach(function (p) { if (ym(p.date) === m) { day(p.date).pay += p.amount; t.pay += p.amount; } });
    });
    return { days: days, t: t };
  }
  function renderMonth() {
    var m = state.month, a = monthAgg(m);
    $('#month-label').textContent = fmtMonthK(m);
    $('#month-date').value = m;
    $('#month-stats').innerHTML = statHtml('치료비 합계', comma(a.t.fee)) + statHtml('수납 합계', comma(a.t.pay), 'paid') + statHtml('미수 합계', comma(a.t.due), a.t.due ? 'pos' : '') +
      '<div class="stat-sub">진료 ' + a.t.n + '건 · 치료비/미수는 이 달 진료분, 수납은 이 달에 받은 금액</div>';
    var keys = Object.keys(a.days).sort();
    $('#month-table').innerHTML = keys.length ? '<thead><tr><th>날짜</th><th>건수</th><th>치료비</th><th>수납</th><th>미수</th></tr></thead><tbody>' +
      keys.map(function (k) { var o = a.days[k]; return '<tr data-day="' + k + '"><td>' + fmtDateS(k) + '</td><td>' + o.n + '</td><td>' + comma(o.fee) + '</td><td>' + comma(o.pay) + '</td><td' + (o.due ? ' class="neg"' : '') + '>' + comma(o.due) + '</td></tr>'; }).join('') +
      '</tbody><tfoot><tr><td>합계</td><td>' + a.t.n + '</td><td>' + comma(a.t.fee) + '</td><td>' + comma(a.t.pay) + '</td><td' + (a.t.due ? ' class="neg"' : '') + '>' + comma(a.t.due) + '</td></tr></tfoot>'
      : '<tbody><tr><td class="center muted" style="text-align:center;padding:24px">이 달의 기록이 없습니다.</td></tr></tbody>';
    var rows = [];
    for (var i = 0; i < 12; i++) {
      var mm = addMonths(ym(today()), -i), ag = monthAgg(mm).t;
      rows.push('<tr data-month="' + mm + '"' + (mm === m ? ' style="background:var(--brand-soft)"' : '') + '><td>' + fmtMonthS(mm) + '</td><td>' + ag.n + '</td><td>' + comma(ag.fee) + '</td><td>' + comma(ag.pay) + '</td><td' + (ag.due ? ' class="neg"' : '') + '>' + comma(ag.due) + '</td></tr>');
    }
    $('#year-table').innerHTML = '<thead><tr><th>월</th><th>건수</th><th>치료비</th><th>수납</th><th>미수</th></tr></thead><tbody>' + rows.join('') + '</tbody>';
  }

  /* ---------- 미수 ---------- */
  function renderUnpaid() {
    var list = db.records.filter(function (r) { return balance(r) > 0; }).sort(byDateAsc);
    var sum = list.reduce(function (s, r) { return s + balance(r); }, 0);
    $('#unpaid-stats').innerHTML = statHtml('미수 환자', list.length + '<small>건</small>', '', false) + statHtml('미수 총액', comma(sum), sum ? 'pos' : '') +
      statHtml('가장 오래된', list.length ? Math.round((parseYmd(today()) - parseYmd(list[0].date)) / 864e5) + '<small>일 전</small>' : '-', '', false);
    $('#unpaid-list').innerHTML = list.length ? list.map(function (r) { return itemHtml(r, { showDate: true }); }).join('') : emptyHtml('미수금이 있는 환자가 없습니다. 👍');
  }

  /* ---------- 검색 ---------- */
  function initSearch() {
    $('#search-q').addEventListener('input', function () { state.q = this.value; renderSearch(); });
    $('#search-q').addEventListener('keydown', function (e) { if (e.key === 'Enter') this.blur(); });
  }
  function renderSearch() {
    var q = norm(state.q);
    if (!q) { $('#search-stats').innerHTML = ''; $('#search-list').innerHTML = emptyHtml('이름(또는 메모)의 일부를 입력하세요.'); return; }
    var list = db.records.filter(function (r) { return norm(r.name).indexOf(q) >= 0 || norm(r.memo).indexOf(q) >= 0; }).sort(byDateDesc);
    var fee = 0, pd = 0, due = 0;
    list.forEach(function (r) { fee += r.total; pd += paid(r); due += Math.max(0, balance(r)); });
    $('#search-stats').innerHTML = list.length ? statHtml('치료비', comma(fee)) + statHtml('수납', comma(pd), 'paid') + statHtml('미수', comma(due), due ? 'pos' : '') + '<div class="stat-sub">' + list.length + '건 검색됨</div>' : '';
    $('#search-list').innerHTML = list.length ? list.map(function (r) { return itemHtml(r, { showDate: true }); }).join('') : emptyHtml('검색 결과가 없습니다.');
  }

  /* ---------- 상세 시트 ---------- */
  var sheet = $('#sheet'), sheetBody = $('#sheet-body'), sheetRecId = null;
  function openRecord(id, mode) {
    var r = findRec(id); if (!r) return;
    sheetRecId = id;
    renderSheet(mode || 'view');
    if (!sheet.open) { if (sheet.showModal) sheet.showModal(); else sheet.setAttribute('open', ''); }
    sheet.scrollTop = 0;
  }
  function closeSheet() { if (sheet.open) { if (sheet.close) sheet.close(); else sheet.removeAttribute('open'); } sheetRecId = null; render(); }
  function renderSheet(mode, editPayId) {
    var r = findRec(sheetRecId); if (!r) { closeSheet(); return; }
    var head = '<div class="sheet-head"><div><h2 id="sheet-title">' + esc(r.name) + '</h2><div class="muted">' + fmtDateFull(r.date) + (r.memo ? ' · ' + esc(r.memo) : '') + '</div></div>' +
      '<button type="button" class="sheet-close" data-act="close" aria-label="닫기">✕</button></div>';
    if (mode === 'edit') {
      sheetBody.innerHTML = head + '<form class="form" id="form-edit" novalidate>' +
        '<label class="field"><span class="label">날짜</span><input type="date" name="date" value="' + r.date + '" required></label>' +
        '<label class="field"><span class="label">환자 이름</span><input type="text" name="name" maxlength="40" list="names-list" value="' + esc(r.name) + '" required></label>' +
        '<label class="field"><span class="label">보철 내용 / 메모</span><input type="text" name="memo" maxlength="80" value="' + esc(r.memo) + '"></label>' +
        '<label class="field"><span class="label">전체 치료비</span><span class="money-wrap"><input type="text" class="money" name="total" inputmode="numeric" pattern="[0-9,]*" value="' + comma(r.total) + '"><span class="unit">원</span></span></label>' +
        '<p class="muted small">수납 내역은 상세 화면에서 개별로 수정·삭제할 수 있습니다.</p>' +
        '<div class="sheet-actions"><button type="button" class="btn btn-ghost" data-act="cancel-edit">취소</button><button type="submit" class="btn btn-primary">수정 저장</button></div></form>';
      bindMoney($('input[name=total]', sheetBody));
      $('#form-edit').addEventListener('submit', function (e) {
        e.preventDefault();
        var f = this, date = f.date.value, name = f.name.value.trim(), total = parseMoney(f.total.value);
        if (!isYmd(date)) { toast('날짜를 선택하세요.'); return; }
        if (!name) { toast('환자 이름을 입력하세요.'); return; }
        if (!f.total.value.trim()) { toast('전체 치료비를 입력하세요.'); return; }
        var backup = JSON.stringify(r);
        r.date = date; r.name = name; r.memo = f.memo.value.trim(); r.total = total; r.updatedAt = new Date().toISOString();
        if (!save()) { Object.assign(r, JSON.parse(backup)); return; }
        toast('수정했습니다.'); renderSheet('view'); render();
      });
      return;
    }
    var pd = paid(r), b = r.total - pd;
    var editing = editPayId ? r.payments.filter(function (p) { return p.id === editPayId; })[0] : null;
    sheetBody.innerHTML = head +
      '<div class="kv">' + statHtml('전체 치료비', comma(r.total)) + statHtml('수납', comma(pd), 'paid') + statHtml(b < 0 ? '초과 수납' : '미수금', comma(Math.abs(b)), b > 0 ? 'pos' : '') + '</div>' +
      '<div class="section-head" style="margin-top:0"><h3>수납 내역</h3><span class="muted small">' + r.payments.length + '건</span></div>' +
      (r.payments.length ? '<ul class="pay-list">' + r.payments.map(function (p) {
        return '<li><div class="pd">' + fmtDateDot(p.date) + (p.method ? ' <small>· ' + p.method + '</small>' : '') + '</div><span class="pa">' + won(p.amount) + '</span>' +
          '<span class="act"><button type="button" data-act="edit-pay" data-pid="' + esc(p.id) + '">수정</button><button type="button" data-act="del-pay" data-pid="' + esc(p.id) + '">삭제</button></span></li>';
      }).join('') + '</ul>' : '<p class="muted">아직 수납 내역이 없습니다.</p>') +
      '<form class="subform form" id="form-pay" novalidate><h3 style="margin:0 0 10px;font-size:16px">' + (editing ? '수납 수정' : '수납 추가 (분할 납부)') + '</h3>' +
      '<label class="field"><span class="label">수납 날짜</span><input type="date" name="pdate" value="' + (editing ? editing.date : today()) + '"></label>' +
      '<div class="field"><span class="label">금액</span><div class="row-gap"><span class="money-wrap grow"><input type="text" class="money" name="pamount" inputmode="numeric" pattern="[0-9,]*" placeholder="0" aria-label="수납 금액" value="' + (editing ? comma(editing.amount) : '') + '"><span class="unit">원</span></span>' +
      (!editing && b > 0 ? '<button type="button" class="btn btn-soft" data-act="fill-rest">잔액</button>' : '') + '</div></div>' +
      '<fieldset class="field seg-field"><legend class="label">결제 방법</legend>' + methodSeg('pmethod', editing ? editing.method : (meta.lastMethod != null ? meta.lastMethod : '카드')) + '</fieldset>' +
      '<div class="' + (editing ? 'sheet-actions' : '') + '">' + (editing ? '<button type="button" class="btn btn-ghost" data-act="cancel-pay">취소</button>' : '') +
      '<button type="submit" class="btn btn-primary' + (editing ? '' : ' btn-block') + '">' + (editing ? '수정 저장' : '수납 추가') + '</button></div></form>' +
      '<div class="sheet-actions"><button type="button" class="btn btn-soft" data-act="edit">기록 수정</button><button type="button" class="btn btn-danger-soft" data-act="delete">기록 삭제</button></div>';
    var amt = $('input[name=pamount]', sheetBody); bindMoney(amt);
    $('#form-pay').addEventListener('submit', function (e) {
      e.preventDefault();
      var date = this.pdate.value, amount = parseMoney(amt.value), method = getRadio(this, 'pmethod');
      if (!isYmd(date)) { toast('수납 날짜를 선택하세요.'); return; }
      if (amount <= 0) { toast('수납 금액을 입력하세요.'); amt.focus(); return; }
      var others = r.payments.reduce(function (s, p) { return s + (editing && p.id === editing.id ? 0 : p.amount); }, 0);
      if (others + amount > r.total && !confirm('수납 합계가 치료비보다 ' + won(others + amount - r.total) + ' 많아집니다. 그대로 저장할까요?')) return;
      var backup = JSON.stringify(r.payments);
      if (editing) { editing.date = date; editing.amount = amount; editing.method = method; }
      else r.payments.push({ id: uid(), date: date, amount: amount, method: method });
      sortPays(r.payments); r.updatedAt = new Date().toISOString();
      if (!save()) { r.payments = JSON.parse(backup); return; }
      meta.lastMethod = method; saveMeta();
      toast(editing ? '수납을 수정했습니다.' : won(amount) + ' 수납을 추가했습니다.');
      renderSheet('view'); render();
    });
  }
  sheet.addEventListener('click', function (e) {
    if (e.target === sheet) { closeSheet(); return; } // 배경 탭
    var btn = e.target.closest('[data-act]'); if (!btn) return;
    var r = findRec(sheetRecId); if (!r) return;
    var act = btn.dataset.act;
    if (act === 'close') closeSheet();
    else if (act === 'edit') renderSheet('edit');
    else if (act === 'cancel-edit' || act === 'cancel-pay') renderSheet('view');
    else if (act === 'fill-rest') setMoney($('input[name=pamount]', sheetBody), Math.max(0, balance(r)));
    else if (act === 'edit-pay') { renderSheet('view', btn.dataset.pid); var f = $('#form-pay'); if (f && f.scrollIntoView) f.scrollIntoView({ block: 'center' }); }
    else if (act === 'del-pay') {
      var p = r.payments.filter(function (x) { return x.id === btn.dataset.pid; })[0]; if (!p) return;
      if (!confirm(fmtDateFull(p.date) + ' ' + won(p.amount) + ' 수납 내역을 삭제할까요?')) return;
      var backup = r.payments.slice();
      r.payments = r.payments.filter(function (x) { return x.id !== p.id; }); r.updatedAt = new Date().toISOString();
      if (!save()) { r.payments = backup; return; }
      toast('수납 내역을 삭제했습니다.'); renderSheet('view'); render();
    } else if (act === 'delete') {
      if (!confirm(r.name + ' 님의 ' + fmtDateFull(r.date) + ' 기록(수납 ' + r.payments.length + '건 포함)을 삭제할까요?\n삭제하면 되돌릴 수 없습니다.')) return;
      var idx = db.records.indexOf(r); db.records.splice(idx, 1);
      if (!save()) { db.records.splice(idx, 0, r); return; }
      toast('기록을 삭제했습니다.'); closeSheet();
    }
  });
  sheet.addEventListener('cancel', function (e) { e.preventDefault(); closeSheet(); });

  /* ---------- 내보내기 / 백업 ---------- */
  function downloadBlob(blob, filename) {
    var done = function () { toast(filename + ' 저장'); };
    var file = null;
    try { file = new File([blob], filename, { type: blob.type }); } catch (e) {}
    var touch = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (touch && file && navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: filename }).then(done).catch(function (err) {
        if (err && err.name === 'AbortError') return;
        anchorDownload(blob, filename); done();
      });
      return;
    }
    anchorDownload(blob, filename); done();
  }
  function anchorDownload(blob, filename) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener'; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 4000);
  }
  function csvCell(v) {
    if (typeof v === 'number') return String(v);
    var s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // 엑셀 수식 주입 방지
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCsv(rows) { return '\uFEFF' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n'; }
  function stamp() { var d = new Date(); return today() + '_' + pad(d.getHours()) + pad(d.getMinutes()); }
  function exportCsvRecords() {
    if (!db.records.length) { toast('내보낼 기록이 없습니다.'); return; }
    var rows = [['진료일', '환자 이름', '보철 내용/메모', '전체 치료비', '수납 합계', '미수금', '수납 횟수', '수납 내역', '기록 ID']];
    db.records.slice().sort(byDateAsc).forEach(function (r) {
      rows.push([r.date, r.name, r.memo, r.total, paid(r), balance(r), r.payments.length,
        r.payments.map(function (p) { return p.date + ' ' + comma(p.amount) + '원' + (p.method ? '(' + p.method + ')' : ''); }).join(' / '), r.id]);
    });
    downloadBlob(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }), '보철장부_환자별_' + stamp() + '.csv');
  }
  function exportCsvPayments() {
    if (!db.records.length) { toast('내보낼 기록이 없습니다.'); return; }
    var rows = [['수납일', '진료일', '환자 이름', '보철 내용/메모', '수납액', '결제 방법', '전체 치료비', '현재 미수금', '기록 ID']];
    var list = [];
    db.records.forEach(function (r) {
      if (!r.payments.length) list.push({ r: r, p: null, k: r.date });
      r.payments.forEach(function (p) { list.push({ r: r, p: p, k: p.date }); });
    });
    list.sort(function (a, b) { return a.k < b.k ? -1 : a.k > b.k ? 1 : 0; });
    list.forEach(function (o) {
      rows.push([o.p ? o.p.date : '', o.r.date, o.r.name, o.r.memo, o.p ? o.p.amount : 0, o.p ? o.p.method : '(수납 없음)', o.r.total, balance(o.r), o.r.id]);
    });
    downloadBlob(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }), '보철장부_수납내역_' + stamp() + '.csv');
  }
  function exportJson() {
    var data = { app: 'prosthetic-ledger', version: 1, exportedAt: new Date().toISOString(), count: db.records.length, records: db.records };
    downloadBlob(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), '보철장부_백업_' + stamp() + '.json');
    meta.lastBackup = new Date().toISOString(); saveMeta(); renderMenu();
  }
  var restoreMode = 'merge';
  function startRestore(mode) { restoreMode = mode; var f = $('#file-restore'); f.value = ''; f.click(); }
  function handleRestoreFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onerror = function () { alert('파일을 읽지 못했습니다.'); };
    reader.onload = function () {
      var o;
      try { o = JSON.parse(String(reader.result).replace(/^\uFEFF/, '')); } catch (e) { alert('올바른 백업(JSON) 파일이 아닙니다.'); return; }
      var arr = Array.isArray(o) ? o : (o && Array.isArray(o.records) ? o.records : null);
      if (!arr) { alert('백업 파일에서 기록을 찾을 수 없습니다.'); return; }
      var recs = arr.map(normalizeRecord).filter(Boolean);
      var skipped = arr.length - recs.length;
      if (!recs.length && arr.length) { alert('백업 파일의 기록 형식이 올바르지 않습니다.'); return; }
      applyRestore(recs, skipped);
    };
    reader.readAsText(file);
  }
  function applyRestore(recs, skipped) {
    var cur = db.records.length, msg;
    if (restoreMode === 'replace') msg = '현재 기록 ' + cur + '건을 모두 지우고 백업 파일의 ' + recs.length + '건으로 교체할까요?';
    else msg = '백업 파일의 ' + recs.length + '건을 현재 기록 ' + cur + '건과 합칠까요?';
    if (skipped) msg += '\n(형식이 잘못된 ' + skipped + '건은 제외됩니다)';
    if (!confirm(msg)) return;
    try { localStorage.setItem(PREV_KEY, JSON.stringify({ savedAt: new Date().toISOString(), records: db.records })); } catch (e) {}
    var before = db.records;
    if (restoreMode === 'replace') db.records = recs;
    else {
      var map = {}; db.records.forEach(function (r) { map[r.id] = r; });
      var added = 0, updated = 0;
      recs.forEach(function (r) { if (map[r.id]) updated++; else added++; map[r.id] = r; });
      db.records = Object.keys(map).map(function (k) { return map[k]; });
    }
    if (!save()) { db.records = before; return; }
    toast(restoreMode === 'replace' ? recs.length + '건으로 교체했습니다.' : '추가 ' + added + '건, 갱신 ' + updated + '건');
    render();
  }
  function renderMenu() {
    var n = db.records.length, pc = db.records.reduce(function (s, r) { return s + r.payments.length; }, 0);
    var lb = meta.lastBackup ? new Date(meta.lastBackup) : null;
    var txt = '현재 기록 ' + n + '건 · 수납 ' + pc + '건. ';
    if (lb) txt += '마지막 백업: ' + ymd(lb) + ' ' + pad(lb.getHours()) + ':' + pad(lb.getMinutes()) + ' (' + (function (n) { return n < 1 ? '오늘' : n + '일 전'; })(Math.floor((Date.now() - lb) / 864e5)) + ')';
    else txt += '아직 백업한 적이 없습니다.';
    $('#backup-status').textContent = txt;
    $('#app-version').textContent = '보철 수납 장부 v' + APP_VERSION + ' · 오프라인 작동 · 데이터는 이 기기에만 저장';
  }
  function initMenu() {
    $('#btn-menu').addEventListener('click', function () { go(state.view === 'menu' ? 'add' : 'menu'); });
    $('#btn-backup').addEventListener('click', exportJson);
    $('#btn-csv-records').addEventListener('click', exportCsvRecords);
    $('#btn-csv-payments').addEventListener('click', exportCsvPayments);
    $('#btn-restore-merge').addEventListener('click', function () { startRestore('merge'); });
    $('#btn-restore-replace').addEventListener('click', function () { startRestore('replace'); });
    $('#file-restore').addEventListener('change', function () { handleRestoreFile(this.files && this.files[0]); });
    $('#btn-wipe').addEventListener('click', function () {
      if (!db.records.length) { toast('삭제할 기록이 없습니다.'); return; }
      if (!confirm('모든 기록 ' + db.records.length + '건을 삭제할까요? 백업하지 않았다면 복구할 수 없습니다.')) return;
      if (!confirm('정말 삭제할까요? 마지막 확인입니다.')) return;
      try { localStorage.setItem(PREV_KEY, JSON.stringify({ savedAt: new Date().toISOString(), records: db.records })); } catch (e) {}
      db.records = []; save(); toast('모든 기록을 삭제했습니다.'); render();
    });
  }

  /* ---------- 초기화 ---------- */
  function init() {
    load();
    initAdd(); initDay(); initMonth(); initSearch(); initMenu();
    $all('.tab').forEach(function (t) { t.addEventListener('click', function () { go(t.dataset.tab); }); });
    document.addEventListener('click', function (e) {
      var o = e.target.closest('[data-open]');
      if (o && !sheet.contains(o)) { e.preventDefault(); openRecord(o.dataset.open); return; }
      var g = e.target.closest('[data-goto]');
      if (g) { e.preventDefault(); go(g.dataset.goto); }
    });
    // 자정이 지나 앱을 다시 열면 기본 날짜를 오늘로 갱신
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      var t = today(); if (t === state.lastToday) return;
      if ($('#add-date').value === state.lastToday) $('#add-date').value = t;
      if (state.day === state.lastToday) state.day = t;
      if (state.month === ym(state.lastToday)) state.month = ym(t);
      state.lastToday = t; render();
    });
    // 다른 탭/창에서 변경된 경우 동기화
    window.addEventListener('storage', function (e) { if (e.key === STORE_KEY) { load(); render(); } });
    go('add');
    if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist().catch(function () {}); } catch (e) {} }
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('SW 등록 실패', e); }); });
    }
  }
  init();
})();
