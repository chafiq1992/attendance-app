import { useEffect, useState } from 'react'
import axios from 'axios'
import { formatHoursHM } from './utils'

export default function PayoutSummary() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [search, setSearch] = useState('')
  const [employees, setEmployees] = useState([])
  const [data, setData] = useState({})

  // Fetch all employee events for the month then load summaries/extras
  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get('/api/events', { params: { month } })
        const uniq = {}
        res.data.forEach(e => {
          uniq[e.employee_id] = true
        })
        const emps = Object.keys(uniq)
        setEmployees(emps)

        const detailPairs = await Promise.all(
          emps.map(async emp => {
            const [summaryRes, extraRes] = await Promise.all([
              axios
                .get('/api/summary', { params: { employee_id: emp, month } })
                .then(r => r.data)
                .catch(() => null),
              axios
                .get('/employee-data', { params: { employee: emp, month } })
                .then(r => r.data)
                .catch(() => []),
            ])

            let days = 0
            let hours = 0
            let extra = 0
            if (summaryRes) {
              hours = summaryRes.total_hours || 0
              extra = summaryRes.total_extra || 0
              days = Object.values(summaryRes.hours_per_day || {}).reduce(
                (s, h) => s + h / 8,
                0
              )
            }

            let advTotal = 0
            let advances = []
            let ordersTotal = 0
            let ordersCount = 0
            let orders = []
            extraRes.forEach(rec => {
              if (rec.advance) {
                advTotal += rec.advance
                advances.push({ date: rec.date, amount: rec.advance })
              }
              if (rec.orders_total) {
                ordersTotal += rec.orders_total
                ordersCount += rec.orders_count
                ;(rec.orders_entries || []).forEach(o =>
                  orders.push({ ...o, date: rec.date })
                )
              }
            })

            return [
              emp,
              {
                dayRate: 0,
                hourRate: 0,
                discount: 0,
                days,
                hours,
                extra,
                advTotal,
                advances,
                ordersTotal,
                ordersCount,
                orders,
                changed: false,
              },
            ]
          })
        )
        setData(Object.fromEntries(detailPairs))
      } catch {
        setEmployees([])
        setData({})
      }
    }
    load()
  }, [month])

  const update = (emp, field, value) => {
    setData(prev => ({
      ...prev,
      [emp]: { ...prev[emp], [field]: value, changed: true },
    }))
  }

  const addAdvance = emp => {
    const amount = prompt('Amount')
    if (!amount) return
    const date = prompt('Date (YYYY-MM-DD)', new Date().toISOString().slice(0, 10))
    if (!date) return
    update(emp, 'advances', [
      ...(data[emp].advances || []),
      { date, amount: Number(amount) },
    ])
    update(emp, 'advTotal', Number(data[emp].advTotal) + Number(amount))
  }

  const removeAdvance = (emp, idx) => {
    const adv = data[emp].advances[idx]
    if (!adv) return
    const newList = data[emp].advances.filter((_, i) => i !== idx)
    update(emp, 'advances', newList)
    update(emp, 'advTotal', Number(data[emp].advTotal) - Number(adv.amount))
  }

  const filtered = employees.filter(e => e.toLowerCase().includes(search.toLowerCase()))

  const monthLabel = new Date(month + '-01').toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="month"
          className="bg-white/10 p-1 rounded-md"
          value={month}
          onChange={e => setMonth(e.target.value)}
        />
        <input
          type="text"
          placeholder="Search"
          className="bg-white/10 p-1 rounded-md flex-1"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map(emp => {
          const d = data[emp]
          if (!d) return null
          const base = d.days * d.dayRate + d.hours * d.hourRate
          const discTotal = d.ordersTotal * (1 - d.discount / 100)
          const net = base + discTotal - d.advTotal
          return (
            <div
              key={emp}
              className={`card space-y-2 ${d.changed ? 'border-yellow-400' : ''}`}
            >
              <div className="flex justify-between items-center bg-sapphire/10 px-2 py-1 rounded">
                <div className="font-semibold">{emp}</div>
                <div className="text-sm">{monthLabel}</div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>Day Price 💰</span>
                  <input
                    type="number"
                    value={d.dayRate}
                    onChange={e => update(emp, 'dayRate', Number(e.target.value))}
                    className="bg-white/10 rounded p-1 w-20 text-right"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span>Hour Price ⏱</span>
                  <input
                    type="number"
                    value={d.hourRate}
                    onChange={e => update(emp, 'hourRate', Number(e.target.value))}
                    className="bg-white/10 rounded p-1 w-20 text-right"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 text-sm">
                <div className="flex justify-between">
                  <span>Worked Days</span>
                  <span className="font-semibold">{d.days.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Worked Hours</span>
                  <span className="font-semibold">{formatHoursHM(d.hours)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Extra Hours</span>
                  <span className="font-semibold">{formatHoursHM(d.extra)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Base Pay</span>
                  <span className="font-semibold">{base.toFixed(2)}</span>
                </div>
              </div>

              <details className="space-y-2">
                <summary className="cursor-pointer font-semibold bg-teal-600/20 px-2 py-1 rounded">
                  Orders: {d.ordersCount} •{' '}
                  {(discTotal).toFixed(2)} DH
                </summary>
                <div className="space-y-2 text-sm">
                  <label className="flex items-center justify-between">
                    <span>Discount {d.discount}%</span>
                    <input
                      type="range"
                      min="0"
                      max="40"
                      value={d.discount}
                      onChange={e => update(emp, 'discount', Number(e.target.value))}
                    />
                  </label>
                  {d.orders.map((o, i) => (
                    <div
                      key={i}
                      className="flex justify-between bg-white/10 rounded px-2 py-1"
                    >
                      <span>{o.date}</span>
                      <span>{o.id}</span>
                      <span>{o.amount}</span>
                    </div>
                  ))}
                </div>
              </details>

              <details className="space-y-2">
                <summary className="cursor-pointer font-semibold bg-emerald-600/20 px-2 py-1 rounded">
                  Advances: {d.advTotal.toFixed(2)} DH
                </summary>
                <div className="space-y-2 text-sm">
                  {d.advances.map((a, i) => (
                    <div
                      key={i}
                      className="flex justify-between items-center bg-white/10 rounded px-2 py-1"
                    >
                      <span>{a.date}</span>
                      <span>{a.amount}</span>
                      <button
                        className="text-red-600"
                        onClick={() => removeAdvance(emp, i)}
                      >
                        ❌
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => addAdvance(emp)}
                    className="underline text-sm"
                  >
                    + Add Advance
                  </button>
                </div>
              </details>

              <div
                className={`font-bold text-center text-lg ${
                  net >= 0 ? 'text-emerald-600' : 'text-coral'
                }`}
              >
                Net: {net.toFixed(2)} DH
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button className="btn btn-sapphire px-4 py-1">Save Changes</button>
                <button className="btn btn-emerald px-4 py-1">Export PDF</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
