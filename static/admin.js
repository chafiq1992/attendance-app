function renderSheetTable(values) {
  if (!Array.isArray(values) || !values.length) {
    document.getElementById('sheet-table').innerText = 'No data';
    return;
  }
  let html = '<table><tbody>';
  values.forEach(row => {
    html += '<tr>' + row.map(c => `<td>${c || ''}</td>`).join('') + '</tr>';
  });
  html += '</tbody></table>';
  document.getElementById('sheet-table').innerHTML = html;
}

function loadEmployee(name) {
  fetch('/admin/attendance/' + encodeURIComponent(name))
    .then(r => r.json())
    .then(data => {
      renderSheetTable(data.values || []);
    })
    .catch(err => {
      document.getElementById('sheet-table').innerText = 'Error: ' + err.message;
    });
}

function loadEmployees() {
  fetch('/admin/employees')
    .then(r => r.json())
    .then(data => {
      const list = document.getElementById('employee-list');
      if (!Array.isArray(data.employees)) {
        list.innerText = 'No employees';
        return;
      }
      let html = '<ul>';
      data.employees.forEach(emp => {
        html += `<li><button class="emp-btn" data-emp="${emp}">${emp}</button></li>`;
      });
      html += '</ul>';
      list.innerHTML = html;
      document.querySelectorAll('.emp-btn').forEach(btn => {
        btn.addEventListener('click', () => loadEmployee(btn.dataset.emp));
      });
    })
    .catch(err => {
      document.getElementById('employee-list').innerText = 'Error: ' + err.message;
    });
}

window.onload = loadEmployees;
