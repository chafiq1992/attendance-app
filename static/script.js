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

// Remove today's logs from localStorage and reset in-memory state
function clearLocalLogs() {
  let key = storageKey();
  localStorage.removeItem(key);
  todayLogs = { main: [], break: [], extra: [] };
  openPeriods = { main: null, break: null, extra: null };
  document.getElementById('status').innerText = 'Status: Not Clocked In';
  renderDayLog();
  renderDayStats();
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
  renderDayStats();
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
  renderDayStats();
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

function renderDayStats() {
  const main = getCategoryTotalMinutes('main');
  const brk = getCategoryTotalMinutes('break');
  const extra = getCategoryTotalMinutes('extra');
  const net = main - brk + extra;
  document.getElementById('stats-summary').innerHTML =
    `<div>Main: ${formatDuration(main)}</div>` +
    `<div>Break: ${formatDuration(brk)}</div>` +
    `<div>Extra: ${formatDuration(extra)}</div>` +
    `<div>Net: ${formatDuration(net)}</div>`;
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
    .then(r => {
      if (!r.ok) {
        return r.text().then(t => {
          throw new Error(`HTTP ${r.status} ${t || r.statusText}`);
        });
      }
      return r.json();
    })
    .then(data => {
      sheetLoaded = true;
      renderSheetTable(data.values || []);
      renderStats(data.values || []);
      renderPerformance(data.values || []);
    })
    .catch(err => {
      sheetLoaded = false;
      document.getElementById('sheet-table').innerText =
        'Error loading data: ' + err.message;
    });
}

function renderSheetTable(values) {
  if (!Array.isArray(values) || !values.length) {
    document.getElementById('sheet-table').innerText = 'No data';
    return;
  }

  let html = '';
  let r = 0;
  while (r < values.length) {
    const firstRow = values[r] || [];
    let firstCell = (firstRow[0] || '').toLowerCase();
    let hasMonth = firstCell && firstCell !== 'name';
    let headerIndex = hasMonth ? r + 1 : r;
    let headerRow = values[headerIndex];
    if (!Array.isArray(headerRow)) {
      r = headerIndex + 1;
      continue;
    }
    if (hasMonth) {
      html += `<div class="sheet-month"><h4>${values[r][0]}</h4>`;
      r += 1;
    } else {
      html += '<div class="sheet-month">';
    }

    html += '<table><thead><tr>';
    headerRow.forEach(h => { html += '<th>' + (h || '') + '</th>'; });
    html += '</tr></thead><tbody>';

    let rowsPerMonth = hasMonth ? 14 : values.length - headerIndex;
    for (let i = 1; i < rowsPerMonth; i++) {
      let row = values[headerIndex + i];
      if (!row) break;
      html += '<tr>';
      for (let c = 0; c < headerRow.length; c++) {
        html += '<td>' + (row[c] || '') + '</td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table></div>';
    r = headerIndex + rowsPerMonth;
  }

  document.getElementById('sheet-table').innerHTML = html;
}

function parseTime(str) {
  if (!str) return null;
  const parts = str.split(':').map(Number);
  if (parts.length !== 2 || parts.some(isNaN)) return null;
  return parts[0] * 60 + parts[1];
}

function parseNumberList(str) {
  if (!str) return [];
  return str
    .split(/[,\n]+/)
    .map(s => parseFloat(s.trim()))
    .filter(v => !isNaN(v));
}

function renderStats(values) {
  if (!Array.isArray(values) || !values.length || !Array.isArray(values[0])) {
    document.getElementById('period-cards').innerHTML = '';
    document.getElementById('payout-history').innerHTML = '';
    document.getElementById('order-history').innerText = '';
    document.getElementById('cash-summary').innerText = '';
    return;
  }

  let headerIdx = 0;
  if ((values[0][0] || '').toLowerCase() !== 'name') {
    headerIdx = 1;
  }
  const dataStart = headerIdx + 1;
  const lastDay = (values[headerIdx] || []).length - 1;
  const periods = [];
  const firstEnd = Math.min(15, lastDay);
  periods.push({ start: 1, end: firstEnd, worked: 0, minutes: 0, extra: 0, cashAdd: 0, cashAddList: [], cashTake: 0, cashTakeList: [], orders: [], advance: 0, payout: null });
  if (lastDay > 15) {
    periods.push({ start: 16, end: lastDay, worked: 0, minutes: 0, extra: 0, cashAdd: 0, cashAddList: [], cashTake: 0, cashTakeList: [], orders: [], advance: 0, payout: null });
  }

  const summary = { worked: 0, minutes: 0, extra: 0, cashAdd: 0, cashAddList: [], cashTake: 0, cashTakeList: [], orders: [] };
  const totalOrdersList = [];
  let totalCash = 0;

  for (let day = 1; day <= lastDay; day++) {
    const p = day <= 15 ? periods[0] : periods[1];

    const inM = parseTime(values[dataStart]?.[day]);
    const outM = parseTime(values[dataStart + 1]?.[day]);
    if (inM != null && outM != null && outM > inM) {
      const main = outM - inM;
      let breakMin = 0;
      const bStart = parseTime(values[dataStart + 4]?.[day]);
      const bEnd = parseTime(values[dataStart + 5]?.[day]);
      if (bStart != null && bEnd != null && bEnd > bStart) {
        breakMin = bEnd - bStart;
      }

      let extraMin = 0;
      const eStart = parseTime(values[dataStart + 7]?.[day]);
      const eEnd = parseTime(values[dataStart + 8]?.[day]);
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

    const cashStr = (values[dataStart + 10]?.[day] || '').trim();
    if (cashStr) {
      const amounts = parseNumberList(cashStr);
      const total = amounts.reduce((s, v) => s + v, 0);
      p.cashAdd += total;
      p.cashAddList.push(...amounts);
      summary.cashAdd += total;
      summary.cashAddList.push(...amounts);
      totalCash += total;
    }

    const ordersStr = (values[dataStart + 11]?.[day] || '').trim();
    if (ordersStr) {
      const arr = ordersStr.split(',').map(s => s.trim()).filter(Boolean);
      p.orders.push(...arr);
      summary.orders.push(...arr);
      totalOrdersList.push(...arr);
    }

    const advStr = (values[dataStart + 13]?.[day] || '').trim();
    if (advStr) {
      const advAmts = parseNumberList(advStr);
      const advTotal = advAmts.reduce((s, v) => s + v, 0);
      p.cashTake += advTotal;
      p.advance += advTotal;
      p.cashTakeList.push(...advAmts);
      summary.cashTake += advTotal;
      summary.cashTakeList.push(...advAmts);
    }

    const payoutVal = parseFloat(values[dataStart + 12]?.[day]);
    if (!isNaN(payoutVal)) {
      p.payout = payoutVal;
    }
  }

  // No summary section at top of stats tab

  const currentCards = [];
  const archivedCards = [];
  periods.forEach(p => {
    const card = `<div class="period-card ${p.payout ? 'archived' : 'current'}">` +
      `<div class="range">${p.start} – ${p.end}</div>` +
      `<div>Worked days: ${p.worked}</div>` +
      `<div>Extra hours: ${formatDuration(p.extra)}</div>` +
      `<div>Cash added: ${p.cashAddList.join(', ')} (Total: ${p.cashAdd})</div>` +
      `<div>Cash taken: ${p.cashTakeList.join(', ')} (Total: ${p.cashTake})</div>` +
      `<div>Orders: ${p.orders.join(', ')}</div>` +
      `<div>Advance: ${p.advance}</div>` +
      (p.payout ? `<div>Payout: ${p.payout}</div>` : '') +
      `</div>`;
    if (p.payout) archivedCards.push(card); else currentCards.push(card);
  });
  document.getElementById('period-cards').innerHTML = currentCards.join('') + archivedCards.join('');

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
  document.getElementById('order-history').innerText = 'Orders: ' + totalOrdersList.join(', ');
  document.getElementById('cash-summary').innerText = 'Total cash: ' + totalCash;
}

function recordPayout() {
  const amt = prompt('Enter payout amount:');
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

function recordOrder() {
  const num = prompt('Enter order number:');
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
  const amt = prompt('Enter avance amount:');
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

function renderPerformance(values) {
  const scoreEl = document.getElementById('performance-score');
  if (!Array.isArray(values) || !values.length || !Array.isArray(values[0])) {
    scoreEl.innerText = 'No data';
    scoreEl.className = '';
    return;
  }

  let headerIdx = 0;
  if ((values[0][0] || '').toLowerCase() !== 'name') {
    headerIdx = 1;
  }
  const dataStart = headerIdx + 1;
  const lastDay = (values[headerIdx] || []).length - 1;

  const inRow = values[dataStart] || [];
  const outRow = values[dataStart + 1] || [];

  let worked = 0;
  let compliant = 0;

  const earlyLimit = 9 * 60 + 5;   // 09:05
  const lateLimit = 18 * 60;        // 18:00

  for (let day = 1; day <= lastDay; day++) {
    const inM = parseTime(inRow[day]);
    const outM = parseTime(outRow[day]);
    if (inM != null && outM != null && outM > inM) {
      // Determine if this is a worked day similar to renderStats (>=7.5h net)
      let breakMin = 0;
      const bStart = parseTime(values[dataStart + 4]?.[day]);
      const bEnd = parseTime(values[dataStart + 5]?.[day]);
      if (bStart != null && bEnd != null && bEnd > bStart) {
        breakMin = bEnd - bStart;
      }
      let extraMin = 0;
      const eStart = parseTime(values[dataStart + 7]?.[day]);
      const eEnd = parseTime(values[dataStart + 8]?.[day]);
      if (eStart != null && eEnd != null && eEnd > eStart) {
        extraMin = eEnd - eStart;
      }
      const net = (outM - inM) - breakMin + extraMin;
      if (net >= 450) {
        worked += 1;
        if (inM < earlyLimit && outM >= lateLimit) {
          compliant += 1;
        }
      }
    }
  }

  let score = 0;
  if (worked > 0) {
    score = Math.round((compliant / worked) * 10 * 10) / 10;
  }

  scoreEl.innerText = 'Performance Score: ' + score + '/10';
  scoreEl.className = score >= 9 ? 'good' : score <= 5 ? 'bad' : '';
}
