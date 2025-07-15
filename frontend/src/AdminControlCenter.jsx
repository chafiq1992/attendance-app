import { useState, useEffect } from 'react'
import axios from 'axios'
import TimelineEntry from './components/TimelineEntry'
import EditRecords from './EditRecords'
import PayoutSummary from './PayoutSummary'

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
      <table className="min-w-full text-sm table-hover">
        <thead>
          <tr>
            <th className="border px-2">Employee</th>
            <th className="border px-2">Status</th>
            <th className="border px-2">Hours Today</th>
            <th className="border px-2">Extra</th>
            <th className="border px-2">Online</th>
            <th className="border px-2">View</th>
          </tr>
        </thead>
        <tbody>
          {data.map(emp => {
            const m = computeMetrics(emp.events)
            return (
              <tr key={emp.id} className="text-center">
                <td className="border px-2">{emp.id}</td>
                <td className="border px-2">{m.status}</td>
                <td className="border px-2">{(m.workedMs/3600000).toFixed(2)}h</td>
                <td className="border px-2">{(m.extraMs/3600000).toFixed(2)}h</td>
                <td className="border px-2">{m.online ? '🟢' : '🔴'}</td>
                <td className="border px-2">
                  <button className="underline" onClick={() => setSelected(emp)}>
                    View
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
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
        {employees.map(emp => {
          const today = new Date().toISOString().slice(0,10)
          const todays = emp.events?.filter(e => e.timestamp.startsWith(today)) || []
          const status = todays.length ? computeMetrics(todays).status : 'Clocked Out'
          return (
            <tr key={emp.id} className="text-center">
              <td className="border px-2">{emp.id}</td>
              <td className="border px-2">{status}</td>
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
      default:
        return null
    }
  }
  return (
    <div className="p-4 space-y-4">
      <div className="flex space-x-4 border-b pb-2">
        <button className={tab==='overview' ? 'font-bold' : ''} onClick={() => setTab('overview')}>Overview</button>
        <button className={tab==='directory' ? 'font-bold' : ''} onClick={() => setTab('directory')}>Employees Directory</button>
        <button className={tab==='edit' ? 'font-bold' : ''} onClick={() => setTab('edit')}>Edit Records</button>
        <button className={tab==='payout' ? 'font-bold' : ''} onClick={() => setTab('payout')}>Payout Summary</button>
      </div>
      {renderTab()}
    </div>
  )
}
