import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import axios from 'axios'

export default function MonthlySheets() {
  const [employee, setEmployee] = useState('')
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setEmployee(params.get('employee') || params.get('driver') || '')
  }, [])

  const [months, setMonths] = useState([])
  const [open, setOpen] = useState(null)
  const [highlighted, setHighlighted] = useState('')

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
      {employee && <h2 className="text-xl font-bold mb-2">{employee}</h2>}
      {months.length > 0 && (
        <div className="sticky top-12 z-20">
          <select
            className="bg-white/10 backdrop-blur-md rounded-md p-1 text-sm"
            onChange={(e) => {
              const idx = months.findIndex((m) => m.monthStr === e.target.value)
              if (idx === 0) {
                window.scrollTo({ top: 0, behavior: 'smooth' })
              } else if (idx > 0) {
                setOpen(idx - 1)
                document.getElementById(`month-${idx}`)?.scrollIntoView({ behavior: 'smooth' })
              }
            }}
          >
            {months.map((m, idx) => (
              <option key={m.monthStr} value={m.monthStr}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {months[0] && (
        <div id="month-0" className="sticky top-0 z-10">
          <div className="card bg-gradient-to-br from-sapphire to-violet shadow-xl">
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
        <div key={m.label} id={`month-${idx + 1}`} className="card bg-white/5 shadow-lg">
          <button
            onClick={() => setOpen(open === idx ? null : idx)}
            className="w-full text-center font-semibold mb-2 flex justify-center"
          >
            <span className="mr-1">📁</span>
            {m.label}
            <span className="ml-1">{open === idx ? '▲' : '▼'}</span>
          </button>
          <AnimatePresence initial={false}>
            {open === idx && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ overflow: 'hidden' }}
              >
                <DayCards rows={m.rows || []} />
              </motion.div>
            )}
          </AnimatePresence>
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
      <table className="w-full text-xs sm:text-sm table-fixed divide-y divide-white/10">
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
          {rows.map((r, i) => {
            const missingCheckout = r.in && !r.out
            const missingBreak = (r.breakStart && !r.breakEnd) || (!r.breakStart && r.breakEnd)
            const hasExtra = parseFloat(r.extraTotal) > 0
            let border = ''
            if (hasExtra) border = 'border-blue-500'
            if (missingCheckout || missingBreak) border = 'border-orange-500'
            if (r.in && r.out && !missingBreak) border = 'border-emerald-500'
            return (
              <tr
                key={r.date}
                onClick={() => setHighlighted(highlighted === r.date ? '' : r.date)}
                className={`${i % 2 ? 'bg-white/5' : ''}${r.weekend ? ' bg-violet/10' : ''}${r.holiday ? ' bg-amber-200/20' : ''}${highlighted === r.date ? ' bg-sapphire/20' : ''} border-l-4 ${border}`}
              >
                <td className="p-1 text-center break-words font-bold text-base">{r.date}</td>
                <td className="p-1 text-center break-words font-mono text-[0.85rem]">{r.in}</td>
                <td className="p-1 text-center break-words font-mono text-[0.85rem]">{r.out}</td>
                <td className="p-1 text-center break-words font-mono text-[0.85rem]">{r.breakStart}</td>
                <td className="p-1 text-center break-words font-mono text-[0.85rem]">{r.breakEnd}</td>
                <td className="p-1 text-center break-words font-mono text-[0.85rem]">{r.extraStart}</td>
                <td className="p-1 text-center break-words font-mono text-[0.85rem]">{r.extraEnd}</td>
                <td className="p-1 text-center break-words font-mono text-[0.85rem]">{r.extraTotal}</td>
              </tr>
            )
          })}
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
        {rows.map(r => {
          const missingCheckout = r.in && !r.out
          const missingBreak = (r.breakStart && !r.breakEnd) || (!r.breakStart && r.breakEnd)
          const hasExtra = parseFloat(r.extraTotal) > 0
          let border = ''
          if (hasExtra) border = 'border-blue-500'
          if (missingCheckout || missingBreak) border = 'border-orange-500'
          if (r.in && r.out && !missingBreak) border = 'border-emerald-500'
          return (
            <div
              key={r.date}
              onClick={() => setHighlighted(highlighted === r.date ? '' : r.date)}
              className={`min-w-[9rem] flex-shrink-0 bg-white/10 rounded-xl p-2 text-xs ${r.weekend ? 'bg-violet/10' : ''} ${r.holiday ? 'bg-amber-200/20' : ''} ${highlighted === r.date ? ' bg-sapphire/20' : ''} border-l-4 ${border}`}
            >
              <div className="font-semibold text-base mb-1">📅 {r.date}</div>
              <div className="font-mono text-[0.85rem]">⏰ In: {r.in || '–'} | Out: {r.out || '–'}</div>
              <div className="font-mono text-[0.85rem]">☕ Break: {r.breakStart || '–'} / {r.breakEnd || '–'}</div>
              <div className="font-mono text-[0.85rem]">⏱️ Extra: {r.extraStart || '–'} / {r.extraEnd || '–'}</div>
              <div className="font-mono text-[0.85rem]">➕ Extra Total: {r.extraTotal ? `${r.extraTotal} h` : '– h'}</div>
            </div>
          )
        })}
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
