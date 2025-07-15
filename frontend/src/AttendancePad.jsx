import { useEffect, useState } from 'react'
import RippleButton from './components/RippleButton'
import { motion, useReducedMotion } from 'framer-motion'
import { useToast } from './components/Toast'
import TimelineEntry from './components/TimelineEntry'
import axios from 'axios'

export default function AttendancePad() {
  const [employee, setEmployee] = useState('')
  const [time, setTime] = useState(new Date())
  const [events, setEvents] = useState([])
  const [bounce, setBounce] = useState('')
  const [use24h, setUse24h] = useState(true)
  const [mood, setMood] = useState('')
  const toast = useToast()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setEmployee(params.get('employee') || params.get('driver') || '')
  }, [])

  useEffect(() => {
    if (!employee) return
    const month = new Date().toISOString().slice(0, 7)
    axios
      .get('/api/events', { params: { employee_id: employee, month } })
      .then((res) => {
        const today = new Date().toISOString().slice(0, 10)
        setEvents(res.data.filter((e) => e.timestamp.startsWith(today)))
      })
      .catch(() => {})
  }, [employee])

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const send = (action) => {
    if (!employee) return
    if (events.some((e) => e.kind === action)) {
      toast('Already done! \u{1F44C}')
      setBounce(action)
      setTimeout(() => setBounce(''), 250)
      return
    }
    const ts = new Date().toISOString()
    axios
      .post('/api/events', null, {
        params: { employee_id: employee, kind: action, timestamp: ts }
      })
      .then((res) => {
        setEvents([...events, { id: res.data.id, kind: action, timestamp: ts }])
        toast('Saved!')
        setBounce(action)
        setTimeout(() => setBounce(''), 250)
      })
      .catch(() => toast('Error', 'error'))
  }

  const shouldReduce = useReducedMotion()

  const actions = [
    { kind: 'clockin', icon: '✅', label: 'Clock In', color: 'emerald' },
    { kind: 'clockout', icon: '🕔', label: 'Clock Out', color: 'coral' },
    { kind: 'startbreak', icon: '🛑', label: 'Start Break', color: 'coral' },
    { kind: 'endbreak', icon: '✅', label: 'End Break', color: 'emerald' },
    { kind: 'startextra', icon: '➕', label: 'Start Extra Hours', color: 'violet' },
    { kind: 'endextra', icon: '🛑', label: 'End Extra Hours', color: 'sapphire' },
  ]

  const timeline = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  let status = 'Clocked Out'
  let statusColor = 'bg-gray-500'
  if (timeline.length) {
    const last = timeline[timeline.length - 1]
    if (last.kind === 'clockout') {
      status = 'Clocked Out'
      statusColor = 'bg-gray-500'
    } else if (last.kind === 'startbreak') {
      status = 'On Break'
      statusColor = 'bg-yellow-500'
    } else {
      status = 'Clocked In'
      statusColor = 'bg-green-600'
    }
  }

  const summary = (() => {
    let inTime = null
    let outTime = null
    let lastBreak = null
    let breakMs = 0
    let lastExtra = null
    let extraMs = 0
    timeline.forEach((e) => {
      const t = new Date(e.timestamp)
      if (e.kind === 'clockin') inTime = t
      if (e.kind === 'clockout') outTime = t
      if (e.kind === 'startbreak') lastBreak = t
      if (e.kind === 'endbreak' && lastBreak) {
        breakMs += t - lastBreak
        lastBreak = null
      }
      if (e.kind === 'startextra') lastExtra = t
      if (e.kind === 'endextra' && lastExtra) {
        extraMs += t - lastExtra
        lastExtra = null
      }
    })
    if (lastBreak) breakMs += Date.now() - lastBreak
    if (lastExtra) extraMs += Date.now() - lastExtra
    let workMs = 0
    if (inTime && outTime) workMs = outTime - inTime - breakMs
    const hoursWorked = workMs > 0 ? workMs / 3600000 : 0
    const penaltyMs = workMs > 0 ? Math.max(0, 8 * 3600000 - workMs) : 0
    return {
      hoursWorked,
      breakMs,
      extraMs,
      penaltyMs,
    }
  })()

  const fmt = (ms) => {
    const h = Math.floor(ms / 3600000)
    const m = Math.round((ms % 3600000) / 60000)
    return `${h}h ${m}m`
  }

  return (
    <motion.div
      initial={shouldReduce ? false : { opacity: 0, y: 20 }}
      animate={shouldReduce ? {} : { opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center w-full max-w-md gap-6"
    >
      <div className="card w-full text-center">
        <div className="text-xl font-semibold" data-testid="name">{employee}</div>
        <div className="mt-2 inline-block bg-sapphire text-white px-3 py-1 rounded-full">
          <div>{time.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
          <div className="font-mono tracking-widest">{time.toLocaleTimeString([], use24h ? {hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false} : {hour: '2-digit', minute: '2-digit', second: '2-digit'})}</div>
        </div>
        <div className="mt-2 flex justify-center">
          <span className={`px-3 py-1 rounded-full text-sm font-semibold text-white ${statusColor}`}>{status}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 w-full">
        {actions.map((a) => {
          const disabled = events.some((e) => e.kind === a.kind)
          return (
            <RippleButton
              key={a.kind}
              disabled={disabled}
              onClick={() => send(a.kind)}
              className={`btn btn-${a.color} ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <span className={bounce === a.kind ? 'animate-bounce-short text-2xl' : 'text-2xl'}>{a.icon}</span>
              <span>{a.label}</span>
            </RippleButton>
          )
        })}
      </div>
      <div className="card w-full text-sm text-center grid grid-cols-2 gap-2">
        <div>🕒 Hours Worked</div>
        <div className="font-semibold">{fmt(summary.hoursWorked * 3600000)}</div>
        <div>🧾 Break</div>
        <div className="font-semibold">{fmt(summary.breakMs)}</div>
        <div>➕ Extra Time</div>
        <div className="font-semibold">{fmt(summary.extraMs)}</div>
        <div>⚠️ Penalty</div>
        <div className="font-semibold">{fmt(summary.penaltyMs)}</div>
      </div>
      <div className="card w-full">
        <h3 className="font-semibold mb-2">Today's Timeline</h3>
        <div className="space-y-2">
          {timeline.map((e, idx) => {
            const a = actions.find((x) => x.kind === e.kind)
            const t = new Date(e.timestamp).toLocaleTimeString([], use24h ? { hour: '2-digit', minute: '2-digit', hour12: false } : { hour: '2-digit', minute: '2-digit' })
            return <TimelineEntry key={e.id} index={idx} icon={a?.icon} label={a?.label} time={t} />
          })}
        </div>
        <button onClick={() => setUse24h(!use24h)} className="mt-2 text-sapphire underline text-sm">
          Toggle {use24h ? 'AM/PM' : '24h'}
        </button>
      </div>
      <div className="flex gap-2">
        {['😃', '🙂', '😐', '🙁', '😡'].map((m) => (
          <button key={m} onClick={() => setMood(m)} className={`text-2xl ${mood === m ? 'scale-110' : ''}`}>{m}</button>
        ))}
      </div>
    </motion.div>
  )
}
