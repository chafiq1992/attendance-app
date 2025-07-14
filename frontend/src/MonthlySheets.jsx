import { useEffect, useState } from 'react'
import axios from 'axios'

export default function MonthlySheets() {
  const [employee, setEmployee] = useState('')
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setEmployee(params.get('employee') || params.get('driver') || '')
  }, [])

  const [months, setMonths] = useState([])
  const [open, setOpen] = useState(null)

  useEffect(() => {
    if (!employee) return
    const now = new Date()
    const mths = []
    for (let i = 0; i < 3; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
      const monthStr = d.toISOString().slice(0, 7)
      const label = d.toLocaleString('default', { month: 'long', year: 'numeric' })
      mths.push({ label, monthStr, rows: [] })
    }
    setMonths(mths)
    mths.forEach(async (m, idx) => {
      try {
        const res = await axios.get('/api/events', {
          params: { employee_id: employee, month: m.monthStr },
        })
        const rows = toRows(res.data, m.monthStr)
        setMonths((prev) => prev.map((x, i) => (i === idx ? { ...x, rows } : x)))
      } catch {
        /* ignore */
      }
    })
  }, [employee])
  return (
    <div className="p-4 space-y-4 overflow-auto h-full scrollbar-thin scrollbar-thumb-sapphire/50">
      {employee && <h2 className="text-xl font-bold">{employee}</h2>}
      {months[0] && (
        <div className="sticky top-0 z-10">
          <div className="card">
            <div className="bg-sapphire text-center -mx-6 -mt-6 rounded-t-xl py-2 text-white font-semibold">
              {months[0].label}
            </div>
            <Table rows={months[0].rows || []} />
          </div>
        </div>
      )}
      {months.slice(1).map((m, idx) => (
        <div key={m.label} className="card">
          <button
            onClick={() => setOpen(open === idx ? null : idx)}
            className="w-full text-left font-semibold mb-2"
          >
            {m.label}
          </button>
          {open === idx && <Table rows={m.rows || []} />}
        </div>
      ))}
    </div>
  )
}

function Table({ rows }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-white/10">
        <tr>
          <th className="p-1">Date</th>
          <th className="p-1">In</th>
          <th className="p-1">Out</th>
          <th className="p-1">Break Start</th>
          <th className="p-1">Break End</th>
          <th className="p-1">Extra Start</th>
          <th className="p-1">Extra End</th>
          <th className="p-1">Total Hrs</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr
            key={r.date}
            className={
              (i % 2 ? 'bg-white/5' : '') +
              (r.weekend ? ' bg-violet/10' : '') +
              (r.holiday ? ' bg-amber-200/20' : '')
            }
          >
            <td className="p-1 text-center whitespace-nowrap">{r.date}</td>
            <td className="p-1 text-center">{r.in}</td>
            <td className="p-1 text-center">{r.out}</td>
            <td className="p-1 text-center">{r.breakStart}</td>
            <td className="p-1 text-center">{r.breakEnd}</td>
            <td className="p-1 text-center">{r.extraStart}</td>
            <td className="p-1 text-center">{r.extraEnd}</td>
            <td className="p-1 text-center">{r.total}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function toRows(events, monthStr) {
  const [year, month] = monthStr.split('-').map(Number)
  const daysInMonth = new Date(year, month, 0).getDate()
  const rows = []
  const mapping = {
    clockin: 'in',
    in: 'in',
    clockout: 'out',
    out: 'out',
    startbreak: 'breakStart',
    endbreak: 'breakEnd',
    startextra: 'extraStart',
    endextra: 'extraEnd',
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${monthStr}-${String(d).padStart(2, '0')}`
    const row = {
      date,
      in: '',
      out: '',
      breakStart: '',
      breakEnd: '',
      extraStart: '',
      extraEnd: '',
      total: '',
      weekend: [0, 6].includes(new Date(date).getDay()),
      holiday: false,
    }
    const dayEvents = events.filter((e) => e.timestamp.startsWith(date))
    dayEvents.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    let lastIn = null
    let total = 0
    dayEvents.forEach((ev) => {
      const key = mapping[ev.kind]
      const time = new Date(ev.timestamp)
      if (key) row[key] = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      if (key === 'in') lastIn = time
      if (key === 'out' && lastIn) {
        total += (time - lastIn) / 3600000
        lastIn = null
      }
    })
    if (total) row.total = total.toFixed(2)
    rows.push(row)
  }
  return rows
}
