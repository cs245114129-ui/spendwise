(function () {
  'use strict';

  /* ---------- Constants ---------- */
  var STORAGE_KEY = 'spendwise.v1';
  var CATEGORIES = ['Food', 'Transport', 'Shopping', 'Education', 'Bills', 'Health', 'Entertainment', 'Other'];
  var COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#9333ea', '#dc2626', '#0891b2', '#db2777', '#64748b'];
  var MAX_AMOUNT = 1000000000;
  var WARN_AT = 0.8;
  var currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

  /* ---------- State ---------- */
  var storageWorks = true;
  var state = loadState();
  var view = { month: currentMonth() };
  var editingId = null;
  var messageTimer = null;
  var resizeTimer = null;

  /* ---------- Helpers ---------- */
  function $(id) { return document.getElementById(id); }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function currentMonth() { return todayISO().slice(0, 7); }

  function validDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }

  function validMonth(s) { return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s); }

  function monthLabel(m) {
    var p = m.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }

  function dateLabel(s) {
    var p = s.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function money(n) { return currency.format(n); }

  function parseAmount(value) {
    var n = Number(value);
    if (!isFinite(n) || n <= 0 || n > MAX_AMOUNT) { return null; }
    return Math.round(n * 100) / 100;
  }

  function sum(list) {
    return list.reduce(function (a, x) { return a + x.amount; }, 0);
  }

  function validEntry(e) {
    return e && typeof e.id === 'string' && typeof e.amount === 'number' && isFinite(e.amount) &&
      validDate(e.date);
  }

  /* ---------- Storage ---------- */
  function emptyState() { return { incomes: [], expenses: [], budgets: {} }; }

  function loadState() {
    var empty = emptyState();
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) { return empty; }
      var p = JSON.parse(raw);
      if (!p || typeof p !== 'object') { return empty; }
      var budgets = {};
      if (p.budgets && typeof p.budgets === 'object') {
        CATEGORIES.forEach(function (c) {
          var v = p.budgets[c];
          if (typeof v === 'number' && isFinite(v) && v > 0) { budgets[c] = v; }
        });
      }
      return {
        incomes: Array.isArray(p.incomes) ? p.incomes.filter(function (i) {
          return validEntry(i) && typeof i.source === 'string';
        }) : [],
        expenses: Array.isArray(p.expenses) ? p.expenses.filter(function (e) {
          return validEntry(e) && typeof e.description === 'string' && CATEGORIES.indexOf(e.category) !== -1;
        }) : [],
        budgets: budgets
      };
    } catch (err) {
      storageWorks = false;
      return empty;
    }
  }

  function persist() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageWorks = true;
    } catch (err) {
      storageWorks = false;
      showMessage('Could not save to browser storage. Your changes will be lost when you close the page.', 'error');
    }
    updateStorageNote();
  }

  function updateStorageNote() {
    var note = $('storage-note');
    if (!storageWorks) {
      note.textContent = 'Browser storage is unavailable (private mode or blocked), so entries will not be kept after the page closes. Use Export CSV to keep a copy.';
    }
  }

  /* ---------- Messages ---------- */
  function showMessage(text, type) {
    var box = $('message');
    box.textContent = text;
    box.className = 'message ' + (type || 'info');
    box.hidden = false;
    if (messageTimer) { clearTimeout(messageTimer); }
    messageTimer = setTimeout(function () { box.hidden = true; }, 4500);
  }

  /* ---------- DOM builders ---------- */
  function td(text, cls) {
    var c = document.createElement('td');
    c.textContent = text;
    if (cls) { c.className = cls; }
    return c;
  }

  function actionButton(label, cls, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-small ' + cls;
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  function emptyRow(body, cols, text) {
    var tr = document.createElement('tr');
    var c = document.createElement('td');
    c.colSpan = cols;
    c.className = 'empty';
    c.textContent = text;
    tr.appendChild(c);
    body.appendChild(tr);
  }

  function clear(node) {
    while (node.firstChild) { node.removeChild(node.firstChild); }
  }

  /* ---------- Derived data ---------- */
  function monthIncomes() {
    return state.incomes.filter(function (i) { return i.date.slice(0, 7) === view.month; });
  }

  function monthExpenses() {
    return state.expenses.filter(function (e) { return e.date.slice(0, 7) === view.month; });
  }

  function spentByCategory(expenses) {
    var m = {};
    expenses.forEach(function (e) { m[e.category] = (m[e.category] || 0) + e.amount; });
    return m;
  }

  /* ---------- Rendering ---------- */
  function renderAll() {
    var incomes = monthIncomes();
    var expenses = monthExpenses();
    var totalIncome = sum(incomes);
    var totalExpenses = sum(expenses);
    var spent = spentByCategory(expenses);

    renderSummary(totalIncome, totalExpenses);
    renderAlerts(totalIncome, totalExpenses, spent);
    renderIncomeList(incomes);
    renderExpenseList(expenses);
    renderBudgets(spent);
    renderChart(spent, totalExpenses);
    renderSavings(totalIncome, totalExpenses);
    renderAdvice(totalIncome, totalExpenses, spent);
  }

  function renderSummary(income, expenses) {
    var balance = income - expenses;
    $('sum-income').textContent = money(income);
    $('sum-expenses').textContent = money(expenses);
    $('sum-balance').textContent = money(balance);
    $('sum-rate').textContent = income > 0 ? (balance / income * 100).toFixed(1) + '%' : '-';
    var card = $('balance-card');
    card.className = 'card' + (balance < 0 ? ' negative' : (income > 0 ? ' positive' : ''));
  }

  function renderAlerts(income, expenses, spent) {
    var list = $('alerts');
    clear(list);
    var items = [];

    if (expenses > income && expenses > 0) {
      items.push({ cls: 'danger', text: 'Spending is ' + money(expenses - income) + ' higher than income this month.' });
    }

    CATEGORIES.forEach(function (c) {
      var limit = state.budgets[c];
      if (!limit) { return; }
      var used = spent[c] || 0;
      if (used > limit) {
        items.push({ cls: 'danger', text: c + ' budget exceeded by ' + money(used - limit) + ' (' + money(used) + ' of ' + money(limit) + ').' });
      } else if (used >= limit * WARN_AT) {
        items.push({ cls: 'warning', text: c + ' is at ' + Math.round(used / limit * 100) + '% of its budget (' + money(used) + ' of ' + money(limit) + ').' });
      }
    });

    if (items.length === 0) {
      items.push({ cls: 'ok', text: 'No budget alerts for ' + monthLabel(view.month) + '.' });
    }

    items.forEach(function (it) {
      var li = document.createElement('li');
      li.className = it.cls;
      li.textContent = it.text;
      list.appendChild(li);
    });
  }

  function renderIncomeList(incomes) {
    var body = $('income-body');
    clear(body);
    if (incomes.length === 0) {
      emptyRow(body, 4, 'No income added for ' + monthLabel(view.month) + '.');
      return;
    }
    incomes.slice().sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); })
      .forEach(function (i) {
        var tr = document.createElement('tr');
        tr.appendChild(td(dateLabel(i.date)));
        tr.appendChild(td(i.source));
        tr.appendChild(td(money(i.amount), 'num'));
        var act = document.createElement('td');
        act.className = 'actions';
        act.appendChild(actionButton('Delete', 'btn-danger', function () { deleteIncome(i.id); }));
        tr.appendChild(act);
        body.appendChild(tr);
      });
  }

  function renderExpenseList(expenses) {
    var body = $('expense-body');
    clear(body);
    if (expenses.length === 0) {
      emptyRow(body, 5, 'No expenses added for ' + monthLabel(view.month) + '.');
      return;
    }
    expenses.slice().sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); })
      .forEach(function (e) {
        var tr = document.createElement('tr');
        tr.appendChild(td(dateLabel(e.date)));
        tr.appendChild(td(e.description));
        tr.appendChild(td(e.category));
        tr.appendChild(td(money(e.amount), 'num'));
        var act = document.createElement('td');
        act.className = 'actions';
        act.appendChild(actionButton('Edit', '', function () { startEdit(e.id); }));
        act.appendChild(actionButton('Delete', 'btn-danger', function () { deleteExpense(e.id); }));
        tr.appendChild(act);
        body.appendChild(tr);
      });
  }

  function renderBudgets(spent) {
    var body = $('budget-body');
    clear(body);
    var cats = CATEGORIES.filter(function (c) { return state.budgets[c]; });
    if (cats.length === 0) {
      emptyRow(body, 5, 'No budgets set yet. Choose a category and a monthly limit above.');
      return;
    }
    cats.forEach(function (c) {
      var limit = state.budgets[c];
      var used = spent[c] || 0;
      var ratio = used / limit;
      var status = ratio > 1 ? 'over' : (ratio >= WARN_AT ? 'warn' : 'ok');

      var tr = document.createElement('tr');
      tr.appendChild(td(c));
      tr.appendChild(td(money(limit), 'num'));
      tr.appendChild(td(money(used), 'num'));

      var usage = document.createElement('td');
      var bar = document.createElement('div');
      bar.className = 'bar';
      var fill = document.createElement('div');
      fill.className = 'fill ' + status;
      fill.style.width = Math.min(ratio * 100, 100) + '%';
      bar.appendChild(fill);
      var pct = document.createElement('div');
      pct.className = 'pct';
      pct.textContent = Math.round(ratio * 100) + '% used';
      usage.appendChild(bar);
      usage.appendChild(pct);
      tr.appendChild(usage);

      var act = document.createElement('td');
      act.className = 'actions';
      act.appendChild(actionButton('Remove', 'btn-danger', function () { removeBudget(c); }));
      tr.appendChild(act);
      body.appendChild(tr);
    });
  }

  function chartData(spent) {
    return CATEGORIES.map(function (c, i) {
      return { name: c, value: spent[c] || 0, color: COLORS[i % COLORS.length] };
    }).filter(function (d) { return d.value > 0; });
  }

  function renderChart(spent, total) {
    var data = chartData(spent);
    drawDonut(data, total);

    var legend = $('legend');
    clear(legend);
    data.forEach(function (d) {
      var li = document.createElement('li');
      var sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = d.color;
      var name = document.createElement('span');
      name.className = 'legend-name';
      name.textContent = d.name;
      var val = document.createElement('span');
      val.textContent = money(d.value) + ' (' + (d.value / total * 100).toFixed(1) + '%)';
      li.appendChild(sw);
      li.appendChild(name);
      li.appendChild(val);
      legend.appendChild(li);
    });
  }

  function drawDonut(data, total) {
    var canvas = $('chart');
    if (!canvas.getContext) { return; }
    var parentWidth = canvas.parentElement.clientWidth || 280;
    var size = Math.max(160, Math.min(parentWidth, 300));
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';

    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    var cx = size / 2;
    var cy = size / 2;
    var radius = size / 2 - 6;

    if (!data.length || !total) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.arc(cx, cy, radius * 0.6, 0, Math.PI * 2, true);
      ctx.fillStyle = '#e2e8f0';
      ctx.fill('evenodd');
      ctx.fillStyle = '#64748b';
      ctx.font = '14px system-ui, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No expenses', cx, cy);
      return;
    }

    var start = -Math.PI / 2;
    data.forEach(function (d) {
      var angle = d.value / total * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, start + angle);
      ctx.closePath();
      ctx.fillStyle = d.color;
      ctx.fill();
      start += angle;
    });

    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '12px system-ui, Arial, sans-serif';
    ctx.fillText('Total spent', cx, cy - 10);
    ctx.font = 'bold 15px system-ui, Arial, sans-serif';
    ctx.fillText(money(total), cx, cy + 10);
  }

  function renderSavings(income, expenses) {
    var saved = income - expenses;
    $('sav-month').textContent = money(saved);
    if (income > 0) {
      $('sav-rate').textContent = (saved / income * 100).toFixed(1) + '%';
      $('sav-year').textContent = money(saved * 12);
    } else {
      $('sav-rate').textContent = '-';
      $('sav-year').textContent = '-';
    }
  }

  function renderAdvice(income, expenses, spent) {
    var list = $('advice');
    clear(list);
    var tips = [];

    if (income === 0 && expenses === 0) {
      tips.push('Add your income and expenses for ' + monthLabel(view.month) + ' to get personalised suggestions.');
    } else if (income === 0) {
      tips.push('Add your income for this month so savings can be calculated.');
    } else {
      var rate = (income - expenses) / income * 100;
      if (rate < 0) {
        tips.push('You are overspending this month. Review your largest categories and look for expenses you can reduce or postpone.');
      } else if (rate < 10) {
        tips.push('Your savings rate is below 10%. Try to set aside at least 10-20% of income before spending on non-essentials.');
      } else if (rate >= 20) {
        tips.push('Your savings rate is ' + rate.toFixed(1) + '%. Keep it up, and consider setting a savings goal.');
      } else {
        tips.push('Your savings rate is ' + rate.toFixed(1) + '%. You are close to the common 20% target.');
      }
    }

    if (expenses > 0) {
      var top = null;
      Object.keys(spent).forEach(function (c) {
        if (top === null || spent[c] > spent[top]) { top = c; }
      });
      if (top && spent[top] / expenses > 0.4) {
        tips.push(top + ' makes up ' + Math.round(spent[top] / expenses * 100) + '% of your spending. Check whether it can be trimmed.');
      }

      var unbudgeted = Object.keys(spent).filter(function (c) { return !state.budgets[c]; });
      if (unbudgeted.length > 0) {
        tips.push('Set monthly budgets for: ' + unbudgeted.join(', ') + '.');
      }
    }

    if (tips.length === 0) {
      tips.push('Your spending looks balanced for this month.');
    }

    tips.forEach(function (t) {
      var li = document.createElement('li');
      li.textContent = t;
      list.appendChild(li);
    });
  }

  /* ---------- Actions ---------- */
  function afterAdd(date, label) {
    var m = date.slice(0, 7);
    if (m !== view.month) {
      view.month = m;
      $('month').value = m;
      showMessage(label + ' Switched to ' + monthLabel(m) + '.', 'info');
    } else {
      showMessage(label, 'success');
    }
    renderAll();
  }

  function deleteIncome(id) {
    if (!window.confirm('Delete this income entry?')) { return; }
    state.incomes = state.incomes.filter(function (i) { return i.id !== id; });
    persist();
    renderAll();
  }

  function deleteExpense(id) {
    if (!window.confirm('Delete this expense?')) { return; }
    state.expenses = state.expenses.filter(function (e) { return e.id !== id; });
    if (editingId === id) { resetExpenseForm(); }
    persist();
    renderAll();
  }

  function removeBudget(category) {
    delete state.budgets[category];
    persist();
    renderAll();
  }

  function startEdit(id) {
    var e = state.expenses.filter(function (x) { return x.id === id; })[0];
    if (!e) { return; }
    editingId = id;
    $('expense-desc').value = e.description;
    $('expense-category').value = e.category;
    $('expense-amount').value = e.amount;
    $('expense-date').value = e.date;
    $('expense-submit').textContent = 'Update expense';
    $('expense-cancel').hidden = false;
    $('expense-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('expense-desc').focus();
  }

  function resetExpenseForm() {
    editingId = null;
    $('expense-form').reset();
    $('expense-date').value = todayISO();
    $('expense-submit').textContent = 'Add expense';
    $('expense-cancel').hidden = true;
  }

  function onIncomeSubmit(ev) {
    ev.preventDefault();
    var source = $('income-source').value.trim();
    var amount = parseAmount($('income-amount').value);
    var date = $('income-date').value;

    if (!source) { showMessage('Enter an income source.', 'error'); return; }
    if (amount === null) { showMessage('Enter a valid income amount greater than zero.', 'error'); return; }
    if (!validDate(date)) { showMessage('Choose a valid date.', 'error'); return; }

    state.incomes.push({ id: uid(), source: source, amount: amount, date: date });
    persist();
    $('income-form').reset();
    $('income-date').value = todayISO();
    afterAdd(date, 'Income added.');
  }

  function onExpenseSubmit(ev) {
    ev.preventDefault();
    var description = $('expense-desc').value.trim();
    var category = $('expense-category').value;
    var amount = parseAmount($('expense-amount').value);
    var date = $('expense-date').value;

    if (!description) { showMessage('Enter an expense description.', 'error'); return; }
    if (CATEGORIES.indexOf(category) === -1) { showMessage('Choose a category.', 'error'); return; }
    if (amount === null) { showMessage('Enter a valid expense amount greater than zero.', 'error'); return; }
    if (!validDate(date)) { showMessage('Choose a valid date.', 'error'); return; }

    var label;
    if (editingId) {
      var target = state.expenses.filter(function (x) { return x.id === editingId; })[0];
      if (target) {
        target.description = description;
        target.category = category;
        target.amount = amount;
        target.date = date;
      }
      label = 'Expense updated.';
    } else {
      state.expenses.push({ id: uid(), description: description, category: category, amount: amount, date: date });
      label = 'Expense added.';
    }
    persist();
    resetExpenseForm();
    afterAdd(date, label);
  }

  function onBudgetSubmit(ev) {
    ev.preventDefault();
    var category = $('budget-category').value;
    var limit = parseAmount($('budget-limit').value);
    if (CATEGORIES.indexOf(category) === -1) { showMessage('Choose a category.', 'error'); return; }
    if (limit === null) { showMessage('Enter a valid budget limit greater than zero.', 'error'); return; }
    state.budgets[category] = limit;
    persist();
    $('budget-limit').value = '';
    showMessage('Budget set for ' + category + '.', 'success');
    renderAll();
  }

  function onMonthChange() {
    var v = $('month').value;
    if (!validMonth(v)) {
      $('month').value = view.month;
      return;
    }
    view.month = v;
    renderAll();
  }

  function csvCell(value) {
    var s = String(value);
    if (/^[=+\-@]/.test(s)) { s = "'" + s; }
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function exportCsv() {
    var rows = [['Type', 'Date', 'Description', 'Category', 'Amount (INR)']];
    state.incomes.forEach(function (i) { rows.push(['Income', i.date, i.source, '', i.amount.toFixed(2)]); });
    state.expenses.forEach(function (e) { rows.push(['Expense', e.date, e.description, e.category, e.amount.toFixed(2)]); });
    Object.keys(state.budgets).forEach(function (c) { rows.push(['Budget', '', 'Monthly limit', c, state.budgets[c].toFixed(2)]); });

    var csv = rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'spendwise-export-' + todayISO() + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    showMessage('CSV exported.', 'success');
  }

  function resetAll() {
    if (!window.confirm('Delete all income, expenses and budgets? This cannot be undone.')) { return; }
    state = emptyState();
    persist();
    resetExpenseForm();
    renderAll();
    showMessage('All data deleted.', 'info');
  }

  /* ---------- Init ---------- */
  function fillSelect(select) {
    CATEGORIES.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      select.appendChild(opt);
    });
  }

  function init() {
    fillSelect($('expense-category'));
    fillSelect($('budget-category'));

    $('month').value = view.month;
    $('income-date').value = todayISO();
    $('expense-date').value = todayISO();

    $('income-form').addEventListener('submit', onIncomeSubmit);
    $('expense-form').addEventListener('submit', onExpenseSubmit);
    $('budget-form').addEventListener('submit', onBudgetSubmit);
    $('expense-cancel').addEventListener('click', resetExpenseForm);
    $('month').addEventListener('change', onMonthChange);
    $('export-btn').addEventListener('click', exportCsv);
    $('reset-btn').addEventListener('click', resetAll);

    window.addEventListener('resize', function () {
      if (resizeTimer) { clearTimeout(resizeTimer); }
      resizeTimer = setTimeout(function () {
        var expenses = monthExpenses();
        renderChart(spentByCategory(expenses), sum(expenses));
      }, 150);
    });

    updateStorageNote();
    renderAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
