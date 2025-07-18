import { useEffect, useState } from 'react'
import axios from 'axios'
import { formatHoursHMLabel, formatDaysHM } from './utils'

export default function PeriodSummary() {
  const [employee, setEmployee] = useState('')
  const [months, setMonths] = useState([])
  const [open, setOpen] = useState(0)
  const [activePeriod, setActivePeriod] = useState({})
  const [advance, setAdvance] = useState('')
  const [advanceDate, setAdvanceDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [orderId, setOrderId] = useState('')
  const [orderTotal, setOrderTotal] = useState('')
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10))
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setEmployee(params.get('employee') || params.get('driver') || '')
  }, [])

  useEffect(() => {
    if (!employee) return
    const now = new Date()
    const mths = []
    for (let i = 0; i < 3; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
      const monthStr = d.toISOString().slice(0, 7)
      const label = d.toLocaleString('default', { month: 'long', year: 'numeric' })
      mths.push({ label, monthStr, periods: [] })
    }
    setMonths(mths)
    const currentMonth = now.toISOString().slice(0, 7)
    const currentIdx = now.getUTCDate() <= 15 ? 0 : 1
    setActivePeriod(
      mths.reduce((acc, m, i) => ({ ...acc, [i]: m.monthStr === currentMonth ? currentIdx : 0 }), {})
    )
    mths.forEach(async (m, idx) => {
      try {
        const [evRes, extraRes] = await Promise.all([
          axios.get('/api/events', { params: { employee_id: employee, month: m.monthStr } }),
          axios.get('/employee-data', { params: { employee, month: m.monthStr } })
        ])
        const periods = calcPeriods(evRes.data, m.monthStr, extraRes.data)
        setMonths((prev) => prev.map((x, i) => (i === idx ? { ...x, periods } : x)))
      } catch {
        /* ignore */
      }
    })
  }, [employee])

  const saveAdvance = async () => {
    if (!advance) return
    try {
      await axios.post('/advance', { employee, amount: advance, date: advanceDate })
      setMonths((prev) =>
        prev.map((m) => {
          if (!advanceDate.startsWith(m.monthStr)) return m
          const idx = Number(advanceDate.slice(-2)) <= 15 ? 0 : 1
          const periods = m.periods.slice()
          const p = { ...periods[idx] }
          p.advance = Number(p.advance) + Number(advance)
          p.balance = p.payout - p.advance
          p.advanceEntries = p.advanceEntries.concat({
            date: advanceDate,
            amount: Number(advance),
          })
          periods[idx] = p
          return { ...m, periods }
        }),
      )
      setAdvance('')
    } catch {
      /* ignore */
    }
  }

  const saveOrder = async () => {
    if (!orderId || !orderTotal) return
    try {
      await axios.post('/record-order', { employee, order_id: orderId, total: orderTotal, date: orderDate })
      setMonths((prev) =>
        prev.map((m) => {
          if (!orderDate.startsWith(m.monthStr)) return m
          const idx = Number(orderDate.slice(-2)) <= 15 ? 0 : 1
          const periods = m.periods.slice()
          const p = { ...periods[idx] }
          p.orders += 1
          p.ordersTotal = Number(p.ordersTotal) + Number(orderTotal)
          periods[idx] = p
          return { ...m, periods }
        }),
      )
      setOrderId('')
      setOrderTotal('')
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="p-4 space-y-4">
      {employee && <h2 className="text-xl font-bold">{employee}</h2>}
      {months.map((m, idx) => (
        <div key={m.label} className="card space-y-2">
          <button
            onClick={() => setOpen(open === idx ? -1 : idx)}
            className="w-full text-left font-semibold mb-2"
          >
            {m.label}
          </button>
          {open === idx && (
            <div className="space-y-4">
              <div className="sticky top-0 z-10 flex justify-center">
                <div className="flex bg-white/10 rounded-full overflow-hidden">
                  {m.periods.map((p, i) => (
                    <button
                      key={p.title}
                      onClick={() => setActivePeriod(prev => ({ ...prev, [idx]: i }))}
                      className={`px-3 py-1 text-sm font-semibold ${ (activePeriod[idx] || 0) === i ? 'bg-sapphire text-white' : '' }`}
                    >
                      {p.title}
                    </button>
                  ))}
                </div>
              </div>
              {(() => {
                const p = m.periods[activePeriod[idx] || 0]
                if (!p) return null
                return (
                  <div className="space-y-4">
                    <div className="text-center text-sm font-semibold bg-white/20 rounded px-2 py-1">
                      {formatDaysHM(p.workedDays)} • <span className="text-blue-400">{formatHoursHMLabel(p.extraHours)}</span> • {p.advance} • <span className={p.balance >= 0 ? 'text-green-500' : 'text-red-500'}>{p.balance}</span>
                    </div>
                    <div className="divide-y divide-white/10 text-sm">
                      <div className="flex justify-between py-1">
                        <span className="whitespace-nowrap">Worked Days</span>
                        <span className="font-bold whitespace-nowrap">{formatDaysHM(p.workedDays)}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="whitespace-nowrap">Extra Hours</span>
                        <span className="font-bold whitespace-nowrap text-blue-400">{formatHoursHMLabel(p.extraHours)}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="whitespace-nowrap">Payout (DH)</span>
                        <span className="font-bold whitespace-nowrap">{p.payout}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="whitespace-nowrap">Advances (DH)</span>
                        <span className="font-bold whitespace-nowrap">{p.advance}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="whitespace-nowrap">Balance</span>
                        <span className={`font-bold whitespace-nowrap ${p.balance >= 0 ? 'text-green-500' : 'text-red-500'}`}>{p.balance}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="whitespace-nowrap">Orders Count</span>
                        <span className="font-bold whitespace-nowrap">{p.orders}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="whitespace-nowrap">Orders Total</span>
                        <span className="font-bold whitespace-nowrap">{p.ordersTotal}</span>
                      </div>
                    </div>
                    <details className="card p-2">
                      <summary className="cursor-pointer font-semibold">Advances <span className="bg-white/20 rounded px-1 text-xs ml-1">{p.advanceEntries.length}</span></summary>
                      <div className="mt-2 space-y-2 text-sm">
                        {p.advanceEntries.map((a, i) => (
                          <div key={i} className="flex justify-between items-center bg-white/10 rounded px-2 py-1">
                            <span>{a.date}</span>
                            <span>{a.amount}</span>
                            <span>🗑️</span>
                          </div>
                        ))}
                      </div>
                    </details>
                    <details className="card p-2">
                      <summary className="cursor-pointer font-semibold">Orders <span className="bg-white/20 rounded px-1 text-xs ml-1">{p.orderEntries?.length || 0}</span></summary>
                      <div className="mt-2 space-y-2 text-sm">
                        {p.orderEntries?.map((o, i) => (
                          <div key={i} className="flex justify-between items-center bg-white/10 rounded px-2 py-1">
                            <span>{o.date}</span>
                            <span>{o.amount}</span>
                            <span>🗑️</span>
                          </div>
                        ))}
                      </div>
                    </details>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="card space-y-2 relative pb-14">
                        <div className="font-semibold mb-1">Add Advance 💸</div>
                        <input type="number" className="w-full rounded bg-white/10 p-1" placeholder="Amount" value={advance} onChange={(e) => setAdvance(e.target.value)} />
                        <input type="date" className="w-full rounded bg-white/10 p-1" value={advanceDate} onChange={(e) => setAdvanceDate(e.target.value)} />
                        <button onClick={saveAdvance} className="btn btn-sapphire w-full shadow-md absolute bottom-2 left-2 right-2">Apply</button>
                      </div>
                      <div className="card space-y-2 relative pb-14">
                        <div className="font-semibold mb-1">Add Order 📑</div>
                        <input type="text" className="w-full rounded bg-white/10 p-1" placeholder="Order ID" value={orderId} onChange={(e) => setOrderId(e.target.value)} />
                        <input type="number" className="w-full rounded bg-white/10 p-1" placeholder="Total" value={orderTotal} onChange={(e) => setOrderTotal(e.target.value)} />
                        <input type="date" className="w-full rounded bg-white/10 p-1" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
                        <button onClick={saveOrder} className="btn btn-sapphire w-full shadow-md absolute bottom-2 left-2 right-2">Apply</button>
                      </div>
                    </div>
                    <div className="bg-white/20 text-center font-semibold py-2 rounded-xl">
                      Worked Days: {m.periods.reduce((s, p2) => s + p2.workedDays, 0).toFixed(2)} | Extra Hours: {m.periods.reduce((s, p2) => s + (p2.extraHours || 0), 0).toFixed(2)} | Payout: {m.periods.reduce((s, p2) => s + p2.payout, 0)} | Advances: {m.periods.reduce((s, p2) => s + p2.advance, 0)} | Balance: {m.periods.reduce((s, p2) => s + p2.balance, 0)}
                    </div>
                  </div>
                )
                })()}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function calcPeriods(events, monthStr, extras = []) {
  const [year, month] = monthStr.split('-').map(Number)
  const daysInMonth = new Date(year, month, 0).getDate()
  const periods = [
    { title: '1 – 15', workedDays: 0, hours: 0, extraHours: 0, payout: 0, advance: 0, balance: 0, orders: 0, ordersTotal: 0, advanceEntries: [], orderEntries: [] },
    { title: `16 – ${daysInMonth}`, workedDays: 0, hours: 0, extraHours: 0, payout: 0, advance: 0, balance: 0, orders: 0, ordersTotal: 0, advanceEntries: [], orderEntries: [] },
  ]
  const mapping = {
    clockin: 'in',
    in: 'in',
    clockout: 'out',
    out: 'out',
    startbreak: 'breakStart',
    endbreak: 'breakEnd',
  }
  const byDay = {}
  events.forEach((e) => {
    const day = new Date(e.timestamp).getUTCDate()
    byDay[day] = byDay[day] || {}
    const key = mapping[e.kind]
    if (key && !byDay[day][key]) byDay[day][key] = new Date(e.timestamp)
  })
  Object.entries(byDay).forEach(([d, info]) => {
    const idx = d <= 15 ? 0 : 1
    if (info.in && info.out) {
      let hrs = (info.out - info.in) / 3600000
      if (info.breakStart && info.breakEnd) {
        hrs -= (info.breakEnd - info.breakStart) / 3600000
      }
      if (hrs < 0) hrs = 0
      periods[idx].hours += hrs
      periods[idx].workedDays += hrs / 8
      if (hrs > 8) periods[idx].extraHours += hrs - 8
    }
  })

  extras.forEach((ex) => {
    const day = new Date(ex.date).getUTCDate()
    const idx = day <= 15 ? 0 : 1
    const p = periods[idx]
    if (ex.payout) p.payout += Number(ex.payout)
    if (ex.advance) {
      p.advance += Number(ex.advance)
      p.advanceEntries.push({ date: ex.date, amount: Number(ex.advance) })
    }
    if (ex.orders_count) p.orders += Number(ex.orders_count)
    if (ex.orders_total) p.ordersTotal += Number(ex.orders_total)
    if (ex.orders_entries) {
      ex.orders_entries.forEach((o) => {
        p.orderEntries.push({ date: ex.date, id: o.id, amount: Number(o.amount) })
      })
    }
  })

  periods.forEach((p) => {
    p.hours = Number(p.hours.toFixed(2))
    p.workedDays = Number(p.workedDays.toFixed(2))
    p.extraHours = Number(p.extraHours.toFixed(2))
    p.balance = p.payout - p.advance
  })
  return periods
}
