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

function loadTodayLogs() {
  let key = 'attendanceLog_' + getTodayKey();
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
  let key = 'attendanceLog_' + getTodayKey();
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

  fetch('/attendance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employee: employeeName, action })
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
