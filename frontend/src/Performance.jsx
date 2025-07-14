import { Line } from 'react-chartjs-2'
import { Chart, LineElement, CategoryScale, LinearScale, PointElement, Tooltip } from 'chart.js'
import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import axios from 'axios'

Chart.register(LineElement, CategoryScale, LinearScale, PointElement, Tooltip)

export default function Performance() {
  const [employee, setEmployee] = useState('')
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setEmployee(params.get('employee') || params.get('driver') || '')
  }, [])

  const [data, setData] = useState(null)

  useEffect(() => {
    if (!employee) return
    const month = new Date().toISOString().slice(0, 7)
    axios
      .get('/api/summary', { params: { employee_id: employee, month } })
      .then((res) => setData(res.data))
      .catch(() => {})
  }, [employee])

  if (!data) return <div className="p-4">Loading...</div>

  const totalScore = Math.round(data.attendance_rate * 100)
  const metrics = [
    { label: 'AM punctuality', icon: '⏰', value: totalScore },
    { label: 'PM punctuality', icon: '🌅', value: totalScore },
    { label: 'Break discipline', icon: '☕', value: totalScore },
    { label: 'Extra hours', icon: '💪', value: Math.min(100, Math.round((data.total_hours / 160) * 100)) },
    { label: 'Consistency', icon: '📆', value: totalScore },
    { label: 'App usage accuracy', icon: '✅', value: 100 },
  ]

  const verdict = (v) => {
    if (v >= 90) return 'Excellent'
    if (v >= 75) return 'Good'
    if (v >= 50) return 'Fair'
    return 'Poor'
  }

  const labels = Object.keys(data.hours_per_day).sort((a, b) => Number(a) - Number(b)).map((d) => `d${d}`)
  const scores = labels.map((l) => Math.min(100, data.hours_per_day[l.slice(1)] * 12.5))
  const lineData = {
    labels,
    datasets: [
      {
        data: scores,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.2)',
        tension: 0.3,
      },
    ],
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.3 }}
      className="p-4 space-y-6"
    >
      {employee && <h2 className="text-xl font-bold">{employee}</h2>}
      <div className="flex justify-center">
        <div className="relative w-40 h-40">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(crimson ${totalScore}%, lime ${totalScore}% 100%)`,
            }}
          />
          <div className="absolute inset-1 bg-background rounded-full flex items-center justify-center text-3xl font-bold">
            {totalScore}%
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="rounded-full px-3 py-1 text-sm font-semibold flex items-center justify-between"
            style={{
              background:
                m.value >= 75
                  ? 'rgba(34,197,94,0.3)'
                  : m.value >= 50
                  ? 'rgba(250,204,21,0.3)'
                  : 'rgba(239,68,68,0.3)',
            }}
          >
            <span>
              {m.icon} {m.label}
            </span>
            <span>
              {m.value}% {verdict(m.value)}
            </span>
          </div>
        ))}
      </div>
      <Line data={lineData} />
    </motion.div>
  )
}
