import { useEffect, useState } from 'react'
import axios from 'axios'

export default function EditRecords() {
  const [employees, setEmployees] = useState([])
  const [employee, setEmployee] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [entries, setEntries] = useState({})
  const [showMissing, setShowMissing] = useState(false)

  useEffect(() => {
    const m = new Date().toISOString().slice(0, 7)
    axios
      .get('/api/events', { params: { month: m } })
      .then(res => {
        const ids = Array.from(new Set(res.data.map(e => e.employee_id)))
        setEmployees(ids)
      })
      .catch(() => setEmployees([]))
  }, [])

  useEffect(() => {
    if (!employee) return
    const m = date.slice(0, 7)
    axios
      .get('/api/events', { params: { employee_id: employee, month: m } })
      .then((res) => {
        const rows = {}
        res.data.forEach((e) => {
          const d = e.timestamp.slice(0, 10)
          rows[d] = rows[d] || {}
          rows[d][e.kind] = e
        })
        setEntries(rows)
      })
      .catch(() => setEntries({}))
  }, [employee, date])

  const handleChange = async (kind) => {
    const ts = prompt('ISO timestamp')
    if (!ts) return
    const row = entries[date] || {}
    if (row[kind]) {
      await axios.patch(`/api/events/${row[kind].id}`, { timestamp: ts })
    } else if (employee) {
      await axios.post('/api/events', {
        employee_id: employee,
        kind,
        timestamp: ts,
      })
    }
  }

  const kinds = [
    ['clockin', 'Clock In'],
    ['clockout', 'Clock Out'],
    ['startbreak', 'Break Start'],
    ['endbreak', 'Break End'],
    ['startextra', 'Extra Start'],
    ['endextra', 'Extra End'],
  ]

  const row = entries[date] || {}
  const missing = kinds.some(([k]) => !row[k])

  if (showMissing && !missing) return null

  return (
    <div className="card space-y-4 relative">
      <button
        className="absolute top-2 right-2 px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50"
        onClick={() => window.location.reload()}
      >
        Restore Original
      </button>
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <select
          className="rounded-lg p-2 border border-gray-300 w-full shadow-sm"
          value={employee}
          onChange={(e) => {
            setEmployee(e.target.value)
            setDate(new Date().toISOString().slice(0, 10))
          }}
        >
          <option disabled value="">
            Select Employee
          </option>
          {employees.map((emp) => (
            <option key={emp}>{emp}</option>
          ))}
        </select>
        <div className="relative">
          <input
            type="date"
            className="rounded-lg p-2 pr-8 border border-gray-300 shadow-sm w-full"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">📅</span>
        </div>
        <label className="flex items-center space-x-2 text-sm">
          <input
            type="checkbox"
            className="toggle-switch"
            checked={showMissing}
            onChange={(e) => setShowMissing(e.target.checked)}
          />
          <span>Show only days with missing data</span>
        </label>
      </div>
      <table className="min-w-full text-sm table-hover border border-gray-200 rounded-lg overflow-hidden">
        <thead className="bg-gray-50">
          <tr>
            <th className="border px-2">Entry</th>
            <th className="border px-2">Time</th>
            <th className="border px-2">Edit</th>
          </tr>
        </thead>
        <tbody>
          {kinds.map(([k, label]) => (
            <tr key={k} className="text-center">
              <td className="border px-2">{label}</td>
              <td className="border px-2">{row[k]?.timestamp?.slice(11, 16) || '--'}</td>
              <td className="border px-2">
                <button
                  className="text-sapphire hover:underline flex items-center gap-1"
                  onClick={() => handleChange(k)}
                >
                  <span>✏️</span>
                  <span>Edit</span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
