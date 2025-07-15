import { useState, useEffect } from 'react'
import axios from 'axios'
import TimelineEntry from './components/TimelineEntry'
import EditRecords from './EditRecords'
import PayoutSummary from './PayoutSummary'
import SettingsLogs from './SettingsLogs'
import AdminHeader from './components/AdminHeader'

const actions = [
  { kind: 'clockin', icon: '✅', label: 'Clock In' },
  { kind: 'clockout', icon: '🕔', label: 'Clock Out' },
  { kind: 'startbreak', icon: '🛑', label: 'Start Break' },
  { kind: 'endbreak', icon: '✅', label: 'End Break' },
  { kind: 'startextra', icon: '➕', label: 'Start Extra Hours' },
  { kind: 'endextra', icon: '🛑', label: 'End Extra Hours' },
]

function computeMetrics(events) {
  const sorted = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  let status = 'Offline'
  let inTime = null
  let breakStart = null
  let extraStart = null
  let workedMs = 0
  let extraMs = 0

  sorted.forEach(ev => {
    const t = new Date(ev.timestamp)
    switch (ev.kind) {
      case 'clockin':
      case 'in':
        if (!inTime) inTime = t
        status = 'Clocked In'
        break
      case 'clockout':
      case 'out':
        if (inTime) {
          workedMs += t - inTime
          inTime = null
        }
        status = 'Clocked Out'
        break
      case 'startbreak':
        if (!breakStart) breakStart = t
        status = 'On Break'
        break
      case 'endbreak':
        if (breakStart) {
          workedMs -= t - breakStart
          breakStart = null
        }
        status = 'Clocked In'
        break
      case 'startextra':
        if (!extraStart) extraStart = t
        status = 'Extra Hours'
        break
      case 'endextra':
        if (extraStart) {
          extraMs += t - extraStart
          extraStart = null
        }
        status = 'Clocked In'
        break
    }
  })

  const now = Date.now()
  if (inTime) workedMs += now - inTime
  if (breakStart) workedMs -= now - breakStart
  if (extraStart) extraMs += now - extraStart

  const online = status !== 'Clocked Out'
  return { status, workedMs, extraMs, events: sorted, online }
}

function OverviewTab() {
  const [data, setData] = useState([])
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    const fetchData = async () => {
      const month = new Date().toISOString().slice(0, 7)
      try {
        const res = await axios.get('/api/events', { params: { month } })
        const today = new Date().toISOString().slice(0, 10)
        const byEmp = {}
        res.data.forEach(e => {
          if (!e.timestamp.startsWith(today)) return
          byEmp[e.employee_id] = byEmp[e.employee_id] || []
          byEmp[e.employee_id].push(e)
        })
        setData(Object.entries(byEmp).map(([id, ev]) => ({ id, events: ev })))
      } catch {
        /* ignore */
      }
    }
    fetchData()
    const id = setInterval(fetchData, 30000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.map(emp => {
          const m = computeMetrics(emp.events)
          return (
            <div key={emp.id} className="card flex items-center space-x-4">
              <img
                src={`https://api.dicebear.com/8.x/identicon/svg?seed=${emp.id}`}
                alt="avatar"
                className="w-12 h-12 rounded-full"
              />
              <div className="flex-1">
                <div className="font-semibold">{emp.id}</div>
                <div className="text-sm">Hours: {(m.workedMs/3600000).toFixed(2)}h</div>
                <div className="text-sm">Extra: {(m.extraMs/3600000).toFixed(2)}h</div>
              </div>
              <div className="flex flex-col items-end space-y-2">
                <span className={`badge ${m.online ? 'bg-emerald/20 text-emerald' : 'bg-coral/20 text-coral'}`}>{m.status}</span>
                <button
                  className="underline text-sm"
                  onClick={() => setSelected(emp)}
                >
                  View
                </button>
              </div>
            </div>
          )
        })}
      </div>
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center" onClick={() => setSelected(null)}>
          <div className="bg-white dark:bg-slate-800 p-4 rounded space-y-2 max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">{selected.id} - Today</h3>
            {computeMetrics(selected.events).events.map((e, idx) => {
              const a = actions.find(x => x.kind === e.kind)
              const t = new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              return <TimelineEntry key={idx} index={idx} icon={a?.icon} label={a?.label} time={t} />
            })}
            <div className="text-center">
              <button className="mt-2 px-4 py-1 bg-sapphire text-white rounded" onClick={() => setSelected(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DirectoryTab() {
  const [employees, setEmployees] = useState([])
  const [query, setQuery] = useState('')
  useEffect(() => {
    const fetchData = async () => {
      const month = new Date().toISOString().slice(0, 7)
      try {
        const res = await axios.get('/api/events', { params: { month } })
        const byEmp = {}
        res.data.forEach(e => {
          byEmp[e.employee_id] = byEmp[e.employee_id] || []
          byEmp[e.employee_id].push(e)
        })
        const arr = Object.entries(byEmp).map(([id, ev]) => {
          const days = new Set(ev.map(e => e.timestamp.slice(0,10)))
          const extra = ev.filter(e => e.kind === 'startextra' || e.kind === 'endextra')
          let extraMs = 0
          let start = null
          extra.forEach(e => {
            const t = new Date(e.timestamp)
            if (e.kind === 'startextra') start = t
            if (e.kind === 'endextra' && start) {
              extraMs += t - start
              start = null
            }
          })
          return {
            id,
            events: ev,
            workedDays: days.size,
            extraHours: (extraMs/3600000).toFixed(2)
          }
        })
        setEmployees(arr)
      } catch {
        /* ignore */
      }
    }
    fetchData()
  }, [])

  return (
    <div className="space-y-2">
      <input
        className="bg-white/10 p-2 rounded w-full md:w-1/3"
        placeholder="Search"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      <table className="min-w-full text-sm table-hover">
        <thead>
          <tr>
            <th className="border px-2">Name</th>
            <th className="border px-2">Status</th>
            <th className="border px-2">Worked Days</th>
            <th className="border px-2">Total Extra Hours</th>
            <th className="border px-2">View Details</th>
          </tr>
        </thead>
        <tbody>
          {employees.filter(e => e.id.toLowerCase().includes(query.toLowerCase())).map(emp => {
            const today = new Date().toISOString().slice(0,10)
            const todays = emp.events?.filter(e => e.timestamp.startsWith(today)) || []
            const status = todays.length ? computeMetrics(todays).status : 'Clocked Out'
            return (
              <tr key={emp.id} className="text-center">
                <td className="border px-2">{emp.id}</td>
                <td className="border px-2">
                  <span className={`badge ${status==='Clocked Out' ? 'bg-coral/20 text-coral' : 'bg-emerald/20 text-emerald'}`}>{status}</span>
                </td>
                <td className="border px-2">{emp.workedDays}</td>
                <td className="border px-2">{emp.extraHours}</td>
                <td className="border px-2">
                  <a className="underline" href={`/employee-dashboard?employee=${encodeURIComponent(emp.id)}`}>View Details</a>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function AdminControlCenter() {
  const [tab, setTab] = useState('overview')
  const renderTab = () => {
    switch (tab) {
      case 'overview':
        return <OverviewTab />
      case 'directory':
        return <DirectoryTab />
      case 'edit':
        return <EditRecords />
      case 'payout':
        return <PayoutSummary />
      case 'settings':
        return <SettingsLogs />
      default:
        return null
    }
  }
  return (
    <>
      <AdminHeader tab={tab} onTabChange={setTab} />
      <div className="p-4 pt-20 space-y-4">
        {renderTab()}
      </div>
    </>
  )
}
