import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { Line, Doughnut } from 'react-chartjs-2'
import { Chart, ArcElement, LineElement, CategoryScale, LinearScale, PointElement, Tooltip, Legend } from 'chart.js'
import { Progress } from './ProgressBar'
import { formatHoursHM } from '../utils'

Chart.register(ArcElement, LineElement, CategoryScale, LinearScale, PointElement, Tooltip, Legend)

export default function EmployeeInlineDashboard({ employee }) {
  const month = new Date().toISOString().slice(0, 7)
  const { data } = useQuery({
    queryKey: ['summary', employee, month],
    enabled: !!employee,
    queryFn: async () => {
      const res = await axios.get('/api/summary', { params: { employee_id: employee, month } })
      return res.data
    },
  })

  if (!data) return <div className="p-2">Loading...</div>

  const days = Object.keys(data.hours_per_day).sort((a, b) => Number(a) - Number(b))
  const lineData = {
    labels: days,
    datasets: [{ label: 'Hours', data: days.map(d => data.hours_per_day[d]) }],
  }

  const present = days.filter(d => data.hours_per_day[d] > 0).length
  const donutData = {
    labels: ['Present', 'Absent'],
    datasets: [{ data: [present, days.length - present], backgroundColor: ['#22c55e', '#ef4444'] }],
  }

  const goal = 160
  const progress = Math.min(1, data.total_hours / goal)

  return (
    <div className="card mt-2 space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <Doughnut data={donutData} />
        <Line data={lineData} />
      </div>
      <Progress value={progress} label={`Hours: ${formatHoursHM(data.total_hours)}/${goal}`} />
      <div>Incomplete days: {data.incomplete_days}</div>
      <table className="min-w-full text-sm table-hover">
        <thead>
          <tr>
            <th className="border px-2">Day</th>
            <th className="border px-2">Hours</th>
          </tr>
        </thead>
        <tbody>
          {days.map(d => (
            <tr key={d}>
              <td className="border px-2">{d}</td>
              <td className="border px-2">{formatHoursHM(data.hours_per_day[d])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
