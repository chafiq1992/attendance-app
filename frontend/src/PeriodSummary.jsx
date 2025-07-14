import { useEffect, useState } from 'react'
import axios from 'axios'

export default function PeriodSummary() {
  const [employee, setEmployee] = useState('')
  const [periods, setPeriods] = useState([])
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setEmployee(params.get('employee') || params.get('driver') || '')
  }, [])

  useEffect(() => {
    if (!employee) return
    const month = new Date().toISOString().slice(0, 7)
    axios
      .get('/api/events', { params: { employee_id: employee, month } })
      .then((res) => setPeriods(calcPeriods(res.data, month)))
      .catch(() => {})
  }, [employee])

  return (
    <div className="p-4 space-y-4">
      {employee && <h2 className="text-xl font-bold">{employee}</h2>}
      <div className="grid md:grid-cols-2 gap-4">
        {periods.map((p) => (
          <div key={p.title} className="card space-y-2">
            <div className="bg-sapphire text-white rounded-full px-3 py-1 inline-block font-semibold">
              {p.title}
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Worked Days</div>
              <div className="text-right font-semibold">{p.workedDays}</div>
              <div>Total Hours</div>
              <div className="text-right font-semibold">{p.hours}</div>
              <div>Payout (DH)</div>
              <div className="text-right font-semibold">{p.payout}</div>
              <div>Advances (DH)</div>
              <div className="text-right font-semibold">{p.advance}</div>
              <div>Balance</div>
              <div className="text-right font-semibold">{p.balance}</div>
              <div>Orders Count</div>
              <div className="text-right font-semibold">{p.orders}</div>
              <div>Orders Total</div>
              <div className="text-right font-semibold">{p.ordersTotal}</div>
            </div>
          </div>
        ))}
        <div className="card space-y-2">
          <div className="font-semibold mb-1">Add Advance \ud83d\udcb8</div>
          <input type="number" className="w-full rounded bg-white/10 p-1" placeholder="Amount" />
          <input type="date" className="w-full rounded bg-white/10 p-1" />
        </div>
        <div className="card space-y-2">
          <div className="font-semibold mb-1">Record Order \ud83d\udcdf</div>
          <input type="text" className="w-full rounded bg-white/10 p-1" placeholder="Order ID" />
          <input type="number" className="w-full rounded bg-white/10 p-1" placeholder="Total" />
        </div>
      </div>
      <div className="bg-white/20 text-center font-semibold py-2 rounded-xl">
        Orders Total: {periods.reduce((s,p)=>s+p.ordersTotal,0)} | Balance: {periods.reduce((s,p)=>s+p.balance,0)}
      </div>
    </div>
  )
}

function calcPeriods(events, monthStr) {
  const [year, month] = monthStr.split('-').map(Number)
  const daysInMonth = new Date(year, month, 0).getDate()
  const periods = [
    { title: '1 – 15', workedDays: 0, hours: 0, payout: 0, advance: 0, balance: 0, orders: 0, ordersTotal: 0 },
    { title: `16 – ${daysInMonth}`, workedDays: 0, hours: 0, payout: 0, advance: 0, balance: 0, orders: 0, ordersTotal: 0 },
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
  periods.forEach((p) => {
    p.hours = Number(p.hours.toFixed(2))
  })
  return periods
}
