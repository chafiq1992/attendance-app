// Get employee name from ?employee= query parameter
var employeeName = new URLSearchParams(window.location.search).get('employee') || '';
let breakStartTime = null, extraStartTime = null, mainStartTime = null;
let pendingAction = null;

// ==== Persistent log state for today ====
let todayLogs = loadTodayLogs();
let openPeriods = getOpenPeriodsFromLogs(todayLogs);

function getTodayKey() {
  const now = new Date();
  let mm = String(now.getMonth() + 1).padStart(2, '0');
  let dd = String(now.getDate()).padStart(2, '0');
  return now.getFullYear() + '-' + mm + '-' + dd;
}

function storageKey() {
  return 'attendanceLog_' + encodeURIComponent(employeeName) + '_' + getTodayKey();
}

function loadTodayLogs() {
  let key = storageKey();
  let raw = localStorage.getItem(key);
  if (raw) {
    let logs = JSON.parse(raw);
    ['main','break','extra'].forEach(cat => {
      logs[cat] = logs[cat].map(ev => ({...ev, time: new Date(ev.time)}));
    });
    return logs;
  }
  return { main: [], break: [], extra: [] };
}

function saveTodayLogs() {
  let key = storageKey();
  localStorage.setItem(key, JSON.stringify(todayLogs));
}

function getOpenPeriodsFromLogs(logs) {
  let open = { main: null, break: null, extra: null };
  ['main','break','extra'].forEach(cat => {
    let lastIn = null;
    logs[cat].forEach(ev => {
      if (ev.type === 'in') lastIn = ev.time;
      if (ev.type === 'out') lastIn = null;
    });
    open[cat] = lastIn;
  });
  return open;
}

window.onload = function() {
  if (!employeeName) {
    document.getElementById('employeeName').innerText = '⛔ No name found!';
    Array.from(document.querySelectorAll('button')).forEach(btn => btn.disabled = true);
    document.getElementById('msg').innerText = '\nAccess denied: This link requires your personal employee link.';
    return;
  }
  document.getElementById('employeeName').innerText = '👤 ' + employeeName;
  startClock();
  renderDayLog();
};

function startClock() {
  setInterval(() => {
    const now = new Date();
    document.getElementById('datetime').innerText = now.toLocaleString();
  }, 1000);
}

function showModal(action) {
  let msg = '', category = '', totalMin = 0;
  let now = new Date();
  let duration = getCurrentDuration(action, now);

  switch(action) {
    case 'clockin':
      msg = `🚪 Welcome to work, ${employeeName}! 🌞 We wish you a nice and happy work day. You are at the door and about to start the day. Let's make it a good one!`;
      category = 'main';
      break;
    case 'clockout':
      msg = `🕔 Great job today, ${employeeName}! We hope you had a great day at work and you gave your best. 🙏 Thank you for your effort! Are you sure you want to clock out? See you tomorrow!`;
      category = 'main';
      break;
    case 'startbreak':
      msg = `🍽️ ${employeeName}, you are about to go to lunch. Have a good meal! 😋 Enjoy your break and recharge your energy.`;
      category = 'break';
      break;
    case 'endbreak':
      msg = `💼 Welcome back, ${employeeName}! You are about to return to work from your lunch break. Ready to get back to it? Let's finish strong! 💪`;
      category = 'break';
      break;
    case 'startextra':
      msg = `⏰ ${employeeName}, you are about to start extra hours. Thank you for your dedication! 🚀`;
      category = 'extra';
      break;
    case 'endextra':
      msg = `🛑 ${employeeName}, you are about to finish your extra hours. Thank you for going the extra mile! 🙌`;
      category = 'extra';
      break;
  }

  totalMin = getCategoryTotalMinutes(category, now, (action.endsWith('in') || action.startsWith('start')) ? false : true);
  let humanTime = formatDuration(totalMin);
  document.getElementById('modalMsg').innerText = msg;
  document.getElementById('modalTime').innerText = `Total running time for this part: ${humanTime}`;
  
  document.getElementById('modalConfirm').style.display = 'flex';
  pendingAction = action;
}

function confirmAction() {
  document.getElementById('modalConfirm').style.display = 'none';
  submitAttendance(pendingAction);
  pendingAction = null;
}

function submitAttendance(action) {
  document.getElementById('msg').innerHTML = '⏳ <em>Submitting attendance...</em>';

  if (!employeeName) {
    document.getElementById('msg').innerText = '⛔ Error: No employee name set.';
    return;
  }

  const now = new Date();
  const day = now.getDate();

  if (action === 'clockin') {
    document.getElementById('status').innerText = 'Status: Clocked In ✅';
    todayLogs.main.push({ type: 'in', time: now });
    openPeriods.main = now;
  } else if (action === 'clockout') {
    document.getElementById('status').innerText = 'Status: Clocked Out 🕔';
    todayLogs.main.push({ type: 'out', time: now });
    openPeriods.main = null;
  } else if (action === 'startbreak') {
    document.getElementById('status').innerText = 'Status: On Break 🛑';
    todayLogs.break.push({ type: 'in', time: now });
    openPeriods.break = now;
  } else if (action === 'endbreak') {
    document.getElementById('status').innerText = 'Status: Break Ended ✅';
    todayLogs.break.push({ type: 'out', time: now });
    openPeriods.break = null;
  } else if (action === 'startextra') {
    document.getElementById('status').innerText = 'Status: Extra Hours Started ➕';
    todayLogs.extra.push({ type: 'in', time: now });
    openPeriods.extra = now;
  } else if (action === 'endextra') {
    document.getElementById('status').innerText = 'Status: Extra Hours Ended 🛑';
    todayLogs.extra.push({ type: 'out', time: now });
    openPeriods.extra = null;
  }

  renderDayLog();

  const payload = { employee: employeeName, action };

  fetch('/attendance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(r => r.json())
  .then(res => {
    document.getElementById('msg').innerText = res.msg || 'OK';
  })
  .catch(err => {
    document.getElementById('msg').innerText = 'Error: ' + err.message;
  });
}

function renderDayLog() {
  function renderSection(arr, label) {
    let entries = [], totalMin = 0;
    arr.forEach(ev => {
      let tstr = ev.time.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
      entries.push(`<div class="log-entry">${tstr} - ${ev.type === 'in' ? 'Start' : 'End'}</div>`);
    });
    totalMin = getCategoryTotalMinutes(label);
    return `\n<div class="log-title">${label.charAt(0).toUpperCase() + label.slice(1)}:</div>\n` +
           (entries.length ? entries.join('') : '<div class="log-entry" style="color:#aaa">—</div>') +
           `\n<div class="log-total">Total: ${formatDuration(totalMin)}</div>`;
  }
  document.getElementById('main-log').innerHTML = renderSection(todayLogs.main, 'main');
  document.getElementById('break-log').innerHTML = renderSection(todayLogs.break, 'break');
  document.getElementById('extra-log').innerHTML = renderSection(todayLogs.extra, 'extra');
  saveTodayLogs();
}

function getCategoryTotalMinutes(category, now = null, ignoreOpen = false) {
  let logs = todayLogs[category];
  let total = 0;
  let last = null;
  logs.forEach(ev => {
    if (ev.type === 'in') last = ev.time;
    else if (ev.type === 'out' && last) {
      total += (ev.time - last) / 60000;
      last = null;
    }
  });
  if (!ignoreOpen && last && (now || new Date())) {
    total += ((now || new Date()) - last) / 60000;
  }
  return Math.round(total);
}

function getCurrentDuration(action, now) {
  if (['clockin','startextra','startbreak'].includes(action)) {
    if (action === 'clockin') return getCategoryTotalMinutes('main', now, true);
    if (action === 'startbreak') return getCategoryTotalMinutes('break', now, true);
    if (action === 'startextra') return getCategoryTotalMinutes('extra', now, true);
  } else {
    if (action === 'clockout') return getCategoryTotalMinutes('main', now, false);
    if (action === 'endbreak') return getCategoryTotalMinutes('break', now, false);
    if (action === 'endextra') return getCategoryTotalMinutes('extra', now, false);
  }
  return 0;
}

function formatDuration(mins) {
  if (mins <= 0) return '0 min';
  let h = Math.floor(mins / 60);
  let m = mins % 60;
  return (h ? `${h}h ` : '') + (m ? `${m}min` : (h ? '' : '0 min'));
}

// ===== Tabs & Sheet Data =====
document.querySelectorAll('.tab-button').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

let sheetLoaded = false;

function switchTab(tab) {
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-content').forEach(div => {
    div.classList.toggle('active', div.id === 'tab-' + tab);
  });
  if ((tab === 'sheet' || tab === 'stats') && !sheetLoaded) {
    fetchSheetData();
  }
}

function fetchSheetData() {
  fetch('/sheet_data?employee=' + encodeURIComponent(employeeName))
    .then(r => r.json())
    .then(data => {
      sheetLoaded = true;
      renderSheetTable(data.values || []);
      renderStats(data.values || []);
    })
    .catch(() => {
      document.getElementById('sheet-table').innerText = 'Error loading data';
    });
}

function renderSheetTable(values) {
  if (!values.length) {
    document.getElementById('sheet-table').innerText = 'No data';
    return;
  }

  let html = '';
  let r = 0;
  while (r < values.length) {
    let firstCell = (values[r][0] || '').toLowerCase();
    let hasMonth = firstCell && firstCell !== 'name';
    let headerRow = hasMonth ? values[r + 1] : values[r];
    if (hasMonth) {
      html += `<div class="sheet-month"><h4>${values[r][0]}</h4>`;
      r += 1;
    } else {
      html += '<div class="sheet-month">';
    }

    html += '<table><thead><tr>';
    headerRow.forEach(h => { html += '<th>' + (h || '') + '</th>'; });
    html += '</tr></thead><tbody>';

    let rowsPerMonth = hasMonth ? 14 : values.length - r;
    for (let i = 1; i < rowsPerMonth; i++) {
      let row = values[r + i];
      if (!row) break;
      html += '<tr>';
      for (let c = 0; c < headerRow.length; c++) {
        html += '<td>' + (row[c] || '') + '</td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table></div>';
    r += rowsPerMonth;
  }

  document.getElementById('sheet-table').innerHTML = html;
}

function parseTime(str) {
  if (!str) return null;
  const parts = str.split(':').map(Number);
  if (parts.length !== 2 || parts.some(isNaN)) return null;
  return parts[0] * 60 + parts[1];
}

function renderStats(values) {
  if (!values.length) {
    document.getElementById('stats-content').innerText = 'No data';
    return;
  }

  const lastDay = values[0].length - 1;
  const periods = [];
  const firstEnd = Math.min(15, lastDay);
  periods.push({ start: 1, end: firstEnd, worked: 0, minutes: 0, extra: 0, cashAdd: 0, cashTake: 0, orders: [], payout: null });
  if (lastDay > 15) {
    periods.push({ start: 16, end: lastDay, worked: 0, minutes: 0, extra: 0, cashAdd: 0, cashTake: 0, orders: [], payout: null });
  }

  let summary = { worked: 0, minutes: 0, extra: 0, cashAdd: 0, cashTake: 0, orders: [] };

  for (let day = 1; day <= lastDay; day++) {
    const p = day <= 15 ? periods[0] : periods[1];

    const inM = parseTime(values[1]?.[day]);
    const outM = parseTime(values[2]?.[day]);
    if (inM != null && outM != null && outM > inM) {
      let main = outM - inM;
      let bStart = parseTime(values[5]?.[day]);
      let bEnd = parseTime(values[6]?.[day]);
      let breakMin = 0;
      if (bStart != null && bEnd != null && bEnd > bStart) {
        breakMin = bEnd - bStart;
      }
      let eStart = parseTime(values[8]?.[day]);
      let eEnd = parseTime(values[9]?.[day]);
      let extraMin = 0;
      if (eStart != null && eEnd != null && eEnd > eStart) {
        extraMin = eEnd - eStart;
      }

      const net = main - breakMin + extraMin;
      if (net >= 450) {
        p.worked += 1;
        summary.worked += 1;
      }
      p.minutes += net;
      summary.minutes += net;

      const extraCalc = Math.max((main - breakMin) - 500, 0) + extraMin;
      p.extra += extraCalc;
      summary.extra += extraCalc;
    }

    const cashVal = parseFloat(values[10]?.[day] || '0');
    if (!isNaN(cashVal)) {
      p.cashAdd += cashVal;
      summary.cashAdd += cashVal;
    }

    const ordersStr = (values[11]?.[day] || '').trim();
    if (ordersStr) {
      const arr = ordersStr.split(',').map(s => s.trim()).filter(Boolean);
      p.orders.push(...arr);
      summary.orders.push(...arr);
    }

    const cashTakeVal = parseFloat(values[13]?.[day] || '0');
    if (!isNaN(cashTakeVal)) {
      p.cashTake += cashTakeVal;
      summary.cashTake += cashTakeVal;
    }

    const payoutVal = parseFloat(values[12]?.[day]);
    if (!isNaN(payoutVal)) {
      p.payout = payoutVal;
    }
  }

  const summaryHtml =
    `<p>Worked days: <strong>${summary.worked}</strong></p>` +
    `<p>Total hours: <strong>${formatDuration(summary.minutes)}</strong></p>` +
    `<p>Extra hours: <strong>${formatDuration(summary.extra)}</strong></p>` +
    `<p>Cash added: <strong>${summary.cashAdd}</strong></p>` +
    `<p>Cash taken: <strong>${summary.cashTake}</strong></p>` +
    `<p>Orders: <strong>${summary.orders.join(', ')}</strong></p>`;
  document.getElementById('stats-content').innerHTML = summaryHtml;

  let cardsHtml = '';
  const currentCards = [];
  const archivedCards = [];
  periods.forEach(p => {
    const card = `<div class="period-card ${p.payout ? 'archived' : 'current'}">` +
      `<div class="range">${p.start} – ${p.end}</div>` +
      `<div>Worked days: ${p.worked}</div>` +
      `<div>Total hours: ${formatDuration(p.minutes)}</div>` +
      `<div>Extra hours: ${formatDuration(p.extra)}</div>` +
      `<div>Cash added: ${p.cashAdd}</div>` +
      `<div>Cash taken: ${p.cashTake}</div>` +
      `<div>Orders: ${p.orders.join(', ')}</div>` +
      `</div>`;
    if (p.payout) archivedCards.push(card); else currentCards.push(card);
  });
  cardsHtml = currentCards.join('') + archivedCards.join('');
  document.getElementById('period-cards').innerHTML = cardsHtml;

  let histHtml = '';
  const paid = periods.filter(p => p.payout);
  if (paid.length) {
    histHtml += '<h4>Payout History</h4><table><thead><tr><th>Start</th><th>End</th><th>Amount</th></tr></thead><tbody>';
    paid.forEach(p => {
      histHtml += `<tr><td>${p.start}</td><td>${p.end}</td><td>${p.payout}</td></tr>`;
    });
    histHtml += '</tbody></table>';
  }
  document.getElementById('payout-history').innerHTML = histHtml;
}

function recordPayout() {
  const amt = document.getElementById('payoutAmount').value;
  if (!amt) return;
  fetch('/payout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employee: employeeName, amount: amt })
  })
  .then(r => r.json())
  .then(res => {
    document.getElementById('msg').innerText = res.msg || 'OK';
    sheetLoaded = false;
    fetchSheetData();
  })
  .catch(err => {
    document.getElementById('msg').innerText = 'Error: ' + err.message;
  });
}

function recordAdvance() {
  const amt = document.getElementById('advanceAmount').value;
  if (!amt) return;
  fetch('/advance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employee: employeeName, amount: amt })
  })
  .then(r => r.json())
  .then(res => {
    document.getElementById('msg').innerText = res.msg || 'OK';
    sheetLoaded = false;
    fetchSheetData();
  })
  .catch(err => {
    document.getElementById('msg').innerText = 'Error: ' + err.message;
  });
}

function recordOrder() {
  const num = document.getElementById('orderInput').value;
  if (!num) return;
  fetch('/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employee: employeeName, number: num })
  })
  .then(r => r.json())
  .then(res => {
    document.getElementById('msg').innerText = res.msg || 'OK';
    sheetLoaded = false;
    fetchSheetData();
  })
  .catch(err => {
    document.getElementById('msg').innerText = 'Error: ' + err.message;
  });
}

function recordCash() {
  const amt = document.getElementById('cashAmount').value;
  if (!amt) return;
  fetch('/cash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employee: employeeName, amount: amt })
  })
  .then(r => r.json())
  .then(res => {
    document.getElementById('msg').innerText = res.msg || 'OK';
    sheetLoaded = false;
    fetchSheetData();
  })
  .catch(err => {
    document.getElementById('msg').innerText = 'Error: ' + err.message;
  });
}
