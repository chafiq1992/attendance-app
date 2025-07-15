import { useEffect, useState } from 'react'
import axios from 'axios'

export default function EditRecords() {
  const [employee, setEmployee] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [entries, setEntries] = useState({})
  const [showMissing, setShowMissing] = useState(false)

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
    <div className="space-y-2">
      <div className="flex space-x-2">
        <input
          className="bg-white/10 p-1 rounded"
          value={employee}
          onChange={(e) => setEmployee(e.target.value)}
          placeholder="Employee"
        />
        <input
          type="date"
          className="bg-white/10 p-1 rounded"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <label className="flex items-center space-x-1 text-sm">
          <input
            type="checkbox"
            checked={showMissing}
            onChange={(e) => setShowMissing(e.target.checked)}
          />
          <span>Show only days with missing data</span>
        </label>
      </div>
      <table className="min-w-full text-sm">
        <thead>
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
              <td className="border px-2">{row[k]?.timestamp?.slice(11, 16) || '-'}</td>
              <td className="border px-2">
                <button className="underline" onClick={() => handleChange(k)}>
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-right">
        <button className="underline" onClick={() => window.location.reload()}>Restore Original</button>
      </div>
    </div>
  )
}
