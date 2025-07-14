import { useEffect, useState } from 'react'
import axios from 'axios'

export default function PeriodSummary() {
  const [employee, setEmployee] = useState('')
  const [months, setMonths] = useState([])
  const [open, setOpen] = useState(0)
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
            <div className="grid md:grid-cols-2 gap-4">
              {m.periods.map((p) => (
                <div key={p.title} className="card space-y-2">
                  <div className="bg-sapphire text-white rounded-full px-3 py-1 inline-block font-semibold">
                    {p.title}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="whitespace-nowrap">Worked Days</div>
                    <div className="text-right font-semibold whitespace-nowrap">{p.workedDays}</div>
                    <div className="whitespace-nowrap">Total Hours</div>
                    <div className="text-right font-semibold whitespace-nowrap">{p.hours}</div>
                    <div className="whitespace-nowrap">Payout (DH)</div>
                    <div className="text-right font-semibold whitespace-nowrap">{p.payout}</div>
                    <div className="whitespace-nowrap">Advances (DH)</div>
                    <div className="text-right font-semibold whitespace-nowrap">{p.advance}</div>
                    <div className="whitespace-nowrap">Balance</div>
                    <div className="text-right font-semibold whitespace-nowrap">{p.balance}</div>
                    <div className="whitespace-nowrap">Orders Count</div>
                    <div className="text-right font-semibold whitespace-nowrap">{p.orders}</div>
                    <div className="whitespace-nowrap">Orders Total</div>
                    <div className="text-right font-semibold whitespace-nowrap">{p.ordersTotal}</div>
                  </div>
                  {p.advanceEntries.length > 0 && (
                    <div className="text-xs space-y-1">
                      <div className="font-semibold">Advance History:</div>
                      <ul className="list-disc ml-4">
                        {p.advanceEntries.map((a, i) => (
                          <li key={i} className="whitespace-nowrap">
                            {a.date.slice(-2)}: {a.amount}
                          </li>
                        ))}
                        <li className="font-semibold">Total: {p.advance}</li>
                      </ul>
                    </div>
                  )}
                </div>
              ))}
              <div className="card space-y-2">
                <div className="font-semibold mb-1">Add Advance \ud83d\udcb8</div>
                <input
                  type="number"
                  className="w-full rounded bg-white/10 p-1"
                  placeholder="Amount"
                  value={advance}
                  onChange={(e) => setAdvance(e.target.value)}
                />
                <input
                  type="date"
                  className="w-full rounded bg-white/10 p-1"
                  value={advanceDate}
                  onChange={(e) => setAdvanceDate(e.target.value)}
                />
                <button onClick={saveAdvance} className="btn btn-sapphire w-full">Apply</button>
              </div>
              <div className="card space-y-2">
                <div className="font-semibold mb-1">Record Order \ud83d\udcdf</div>
                <input
                  type="text"
                  className="w-full rounded bg-white/10 p-1"
                  placeholder="Order ID"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                />
                <input
                  type="number"
                  className="w-full rounded bg-white/10 p-1"
                  placeholder="Total"
                  value={orderTotal}
                  onChange={(e) => setOrderTotal(e.target.value)}
                />
                <input
                  type="date"
                  className="w-full rounded bg-white/10 p-1"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                />
                <button onClick={saveOrder} className="btn btn-sapphire w-full">Apply</button>
              </div>
              <div className="bg-white/20 text-center font-semibold py-2 rounded-xl">
                Orders Total: {m.periods.reduce((s,p)=>s+p.ordersTotal,0)} | Balance: {m.periods.reduce((s,p)=>s+p.balance,0)}
              </div>
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
    { title: '1 – 15', workedDays: 0, hours: 0, payout: 0, advance: 0, balance: 0, orders: 0, ordersTotal: 0, advanceEntries: [] },
    { title: `16 – ${daysInMonth}`, workedDays: 0, hours: 0, payout: 0, advance: 0, balance: 0, orders: 0, ordersTotal: 0, advanceEntries: [] },
  ]
  const mapping = { clockin: 'in', in: 'in', clockout: 'out', out: 'out' }
  const byDay = {}
  events.forEach((e) => {
    const day = new Date(e.timestamp).getUTCDate()
    byDay[day] = byDay[day] || {}
    const key = mapping[e.kind]
    if (key) byDay[day][key] = new Date(e.timestamp)
  })
  Object.entries(byDay).forEach(([d, info]) => {
    const idx = d <= 15 ? 0 : 1
    periods[idx].workedDays += 1
    if (info.in && info.out) {
      periods[idx].hours += (info.out - info.in) / 3600000
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
  })

  periods.forEach((p) => {
    p.hours = Number(p.hours.toFixed(2))
    p.balance = p.payout - p.advance
  })
  return periods
}
