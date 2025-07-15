import { useEffect, useState } from 'react'
import axios from 'axios'

export default function PayoutSummary() {
  const [employees, setEmployees] = useState([])
  const [rates, setRates] = useState({})
  const [summary, setSummary] = useState({})
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0,7))

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get('/api/events', { params: { month } })
        const byEmp = {}
        res.data.forEach(e => {
          const day = e.timestamp.slice(0,10)
          byEmp[e.employee_id] = byEmp[e.employee_id] || {}
          byEmp[e.employee_id][day] = true
        })
        const employees = Object.keys(byEmp)
        setEmployees(employees)
        const summaries = {}
        employees.forEach(emp => {
          const days = Object.keys(byEmp[emp]).length
          summaries[emp] = { days }
        })
        setSummary(summaries)
      } catch {
        setEmployees([])
        setSummary({})
      }
    }
    fetchData()
  }, [month])

  const handleRateChange = (emp, value) => {
    setRates(prev => ({ ...prev, [emp]: value }))
  }

  return (
    <div className="space-y-2">
      <input
        type="month"
        className="bg-white/10 p-2 rounded-md"
        value={month}
        onChange={e => setMonth(e.target.value)}
      />
      <table className="min-w-full text-sm table-hover">
        <thead>
          <tr>
            <th className="border px-2">Employee</th>
            <th className="border px-2">Day Price 💰</th>
            <th className="border px-2">Worked Days</th>
            <th className="border px-2">Base Pay</th>
          </tr>
        </thead>
        <tbody>
          {employees.map(emp => {
            const rate = rates[emp] || 0
            const days = summary[emp]?.days || 0
            const base = (rate * days).toFixed(2)
            return (
              <tr key={emp} className="text-center">
                <td className="border px-2">{emp}</td>
                <td className="border px-2">
                  <input
                    type="number"
                    value={rate}
                    onChange={e => handleRateChange(emp, e.target.value)}
                    className="bg-white/10 p-2 rounded-md w-24 text-right"
                  />
                </td>
                <td className="border px-2">{days}</td>
                <td className="border px-2">{base}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
