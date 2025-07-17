import { useEffect, useState } from 'react'
import axios from 'axios'
import { useToast } from './components/Toast'

const kinds = [
  ['clockin', 'Clock In'],
  ['clockout', 'Clock Out'],
  ['startbreak', 'Break Start'],
  ['endbreak', 'Break End'],
  ['startextra', 'Extra Start'],
  ['endextra', 'Extra End'],
]

export default function EditRecords() {
  const toast = useToast()
  const [employees, setEmployees] = useState([])
  const [employee, setEmployee] = useState('')
  const [month, setMonth] = useState(() => new Date())
  const [entries, setEntries] = useState({})
  const [summary, setSummary] = useState(null)
  const [showMissing, setShowMissing] = useState(false)
  const [editing, setEditing] = useState(null) // {date, kind, value}

  const monthStr = month.toISOString().slice(0, 7)

  const fetchEmployees = async () => {
    try {
      const res = await axios.get('/api/events', { params: { month: monthStr } })
      const ids = Array.from(new Set(res.data.map((e) => e.employee_id)))
      setEmployees(ids)
    } catch {
      setEmployees([])
    }
  }

  const fetchData = async () => {
    if (!employee) return
    try {
      const [evRes, sumRes] = await Promise.all([
        axios.get('/api/events', { params: { employee_id: employee, month: monthStr } }),
        axios.get('/api/summary', { params: { employee_id: employee, month: monthStr } }),
      ])
      const rows = {}
      evRes.data.forEach((e) => {
        const d = e.timestamp.slice(0, 10)
        rows[d] = rows[d] || {}
        rows[d][e.kind] = e
      })
      setEntries(rows)
      setSummary(sumRes.data)
    } catch {
      setEntries({})
      setSummary(null)
    }
  }

  useEffect(() => {
    fetchEmployees()
  }, [])

  useEffect(() => {
    fetchData()
  }, [employee, monthStr])

  const startEdit = (date, kind, row) => {
    const val = row[kind]?.timestamp?.slice(11, 16) || ''
    setEditing({ date, kind, value: val })
  }

  const saveEdit = async () => {
    if (!editing || !editing.value) {
      setEditing(null)
      return
    }
    const { date, kind, value } = editing
    const ts = new Date(`${date}T${value}`).toISOString()
    const row = entries[date] || {}
    try {
      if (row[kind]) {
        await axios.patch(`/api/events/${row[kind].id}`, { timestamp: ts })
        row[kind].timestamp = ts
      } else {
        const res = await axios.post('/api/events', {
          employee_id: employee,
          kind,
          timestamp: ts,
        })
        row[kind] = { id: res.data.id, employee_id: employee, kind, timestamp: ts }
      }
      setEntries((prev) => ({ ...prev, [date]: { ...row } }))
      toast('Saved ✓')
      fetchData()
    } catch {
      toast('Error', 'error')
    }
    setEditing(null)
  }

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const tableRows = []
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${monthStr}-${String(d).padStart(2, '0')}`
    const row = entries[dateStr] || {}
    const missing = kinds.some(([k]) => !row[k])
    if (showMissing && !missing) continue
    const bad =
      row.clockin &&
      row.clockout &&
      new Date(row.clockout.timestamp) < new Date(row.clockin.timestamp)
    tableRows.push({ date: dateStr, row, missing, bad })
  }

  const workedDays = summary
    ? Object.values(summary.hours_per_day).filter((h) => h > 0).length
    : 0
  const workedHours = summary ? summary.total_hours : 0
  const extraHours = summary ? summary.total_extra : 0

  const changeMonth = (delta) => {
    setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <select
          className="rounded-lg p-2 border border-gray-300 w-full shadow-sm"
          value={employee}
          onChange={(e) => setEmployee(e.target.value)}
        >
          <option disabled value="">
            Select Employee
          </option>
          {employees.map((emp) => (
            <option key={emp}>{emp}</option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <button className="px-2 py-1 border rounded" onClick={() => changeMonth(-1)}>
            ‹
          </button>
          <div className="font-semibold">
            {month.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </div>
          <button className="px-2 py-1 border rounded" onClick={() => changeMonth(1)}>
            ›
          </button>
        </div>
        <label className="flex items-center space-x-2 text-sm">
          <input
            type="checkbox"
            className="toggle-switch"
            checked={showMissing}
            onChange={(e) => setShowMissing(e.target.checked)}
          />
          <span>Missing only</span>
        </label>
      </div>

      <div className="card p-4 space-y-2">
        <div className="flex justify-end">
          <button
            className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50"
            onClick={fetchData}
          >
            Restore Original
          </button>
        </div>
        <table className="min-w-full text-xs sm:text-sm table-fixed">
          <thead className="bg-sapphire text-white">
            <tr>
              <th className="p-1">Day</th>
              {kinds.map(([k, label]) => (
                <th key={k} className="p-1">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map(({ date, row, missing, bad }, idx) => (
              <tr
                key={date}
                className={`${idx % 2 ? 'bg-gray-50' : ''} ${missing ? 'bg-yellow-100' : ''} ${bad ? 'border-2 border-red-500' : 'border-b'} text-center`}
              >
                <td className="p-1">{date.slice(-2)}</td>
                {kinds.map(([k]) => (
                  <td
                    key={k}
                    className="p-1 cursor-pointer"
                    onClick={() => startEdit(date, k, row)}
                  >
                    {editing && editing.date === date && editing.kind === k ? (
                      <div className="flex items-center justify-center">
                        <input
                          type="time"
                          value={editing.value}
                          onChange={(e) => setEditing((prev) => ({ ...prev, value: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEdit()
                          }}
                          className="border px-1 rounded"
                          autoFocus
                        />
                        <button className="ml-1 text-sapphire" onClick={saveEdit}>
                          ✓
                        </button>
                      </div>
                    ) : (
                      row[k]?.timestamp?.slice(11, 16) || '—'
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="font-semibold text-center">
          Worked Days {workedDays} • Worked Hours {workedHours.toFixed(2)} • Extra Hours {extraHours.toFixed(2)}
        </div>
      </div>
    </div>
  )
}
