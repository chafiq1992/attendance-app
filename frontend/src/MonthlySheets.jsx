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
            {/* desktop table */}
            <div className="hidden sm:block">
              <Table rows={months[0].rows || []} />
            </div>
            {/* mobile cards */}
            <div className="sm:hidden">
              <DayCards rows={months[0].rows || []} />
            </div>
          </div>
        </div>
      )}
      {months.slice(1).map((m, idx) => (
        <div key={m.label} className="card bg-white/5">
          <button
            onClick={() => setOpen(open === idx ? null : idx)}
            className="w-full text-center font-semibold mb-2 flex justify-center"
          >
            <span className="mr-1">📁</span>
            {m.label}
            <span className="ml-1">{open === idx ? '▲' : '▼'}</span>
          </button>
          {open === idx && (
            <div>
              <DayCards rows={m.rows || []} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function Table({ rows }) {
  const daysWorked = rows.filter(r => r.in || r.out).length
  const extraHours = rows.reduce((s, r) => s + (parseFloat(r.extraTotal) || 0), 0)
  return (
    <div className="overflow-auto">
      <table className="w-full text-xs sm:text-sm table-fixed">
        <thead className="bg-white/10 sticky top-0 z-10">
          <tr>
            <th className="p-1">Date</th>
            <th className="p-1">In</th>
            <th className="p-1">Out</th>
            <th className="p-1">Break ⬅️</th>
            <th className="p-1">Break ➡️</th>
            <th className="p-1">Extra ⬅️</th>
            <th className="p-1">Extra ➡️</th>
            <th className="p-1">Extra Hrs</th>
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
              <td className="p-1 text-center break-words">{r.date}</td>
              <td className="p-1 text-center break-words">{r.in}</td>
              <td className="p-1 text-center break-words">{r.out}</td>
              <td className="p-1 text-center break-words">{r.breakStart}</td>
              <td className="p-1 text-center break-words">{r.breakEnd}</td>
              <td className="p-1 text-center break-words">{r.extraStart}</td>
              <td className="p-1 text-center break-words">{r.extraEnd}</td>
              <td className="p-1 text-center break-words">{r.extraTotal}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="bg-white/20 text-center font-semibold py-1 sticky bottom-0">
        ✅ Days Worked: {daysWorked} | 🕒 Extra Hours: {extraHours.toFixed(1)}h
      </div>
    </div>
  )
}

function DayCards({ rows }) {
  const daysWorked = rows.filter(r => r.in || r.out).length
  const extraHours = rows.reduce((s, r) => s + (parseFloat(r.extraTotal) || 0), 0)
  return (
    <div>
      <div className="flex overflow-x-auto space-x-2 pb-2">
        {rows.map(r => (
          <div
            key={r.date}
            className={`min-w-[9rem] flex-shrink-0 bg-white/10 rounded-xl p-2 text-xs ${r.weekend ? 'bg-violet/10' : ''} ${r.holiday ? 'bg-amber-200/20' : ''}`}
          >
            <div className="font-semibold mb-1">📅 {r.date}</div>
            <div>⏰ In: {r.in || '–'} | Out: {r.out || '–'}</div>
            <div>☕ Break: {r.breakStart || '–'} / {r.breakEnd || '–'}</div>
            <div>⏱️ Extra: {r.extraStart || '–'} / {r.extraEnd || '–'}</div>
            <div>➕ Extra Total: {r.extraTotal ? `${r.extraTotal} h` : '– h'}</div>
          </div>
        ))}
      </div>
      <div className="bg-white/20 text-center font-semibold py-1 rounded-b-xl">
        ✅ Days Worked: {daysWorked} | 🕒 Extra Hours: {extraHours.toFixed(1)}h
      </div>
    </div>
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
      extraTotal: '',
      weekend: [0, 6].includes(new Date(date).getDay()),
      holiday: false,
    }
    const dayEvents = events.filter((e) => e.timestamp.startsWith(date))
    dayEvents.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    let lastIn = null
    let lastExtra = null
    let extraTotal = 0
    dayEvents.forEach((ev) => {
      const key = mapping[ev.kind]
      const time = new Date(ev.timestamp)
      if (key) row[key] = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      if (key === 'in') lastIn = time
      if (key === 'out' && lastIn) {
        lastIn = null
      }
      if (key === 'extraStart') lastExtra = time
      if (key === 'extraEnd' && lastExtra) {
        extraTotal += (time - lastExtra) / 3600000
        lastExtra = null
      }
    })
    if (extraTotal) row.extraTotal = extraTotal.toFixed(2)
    rows.push(row)
  }
  return rows
}
