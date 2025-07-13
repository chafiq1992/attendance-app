import { useEffect, useState } from 'react'
import RippleButton from './components/RippleButton'
import { motion, useReducedMotion } from 'framer-motion'
import { useToast } from './components/Toast'
import axios from 'axios'

export default function AttendancePad() {
  const [employee, setEmployee] = useState('')
  const [time, setTime] = useState(new Date())
  const [events, setEvents] = useState([])
  const [bounce, setBounce] = useState('')
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

  return (
    <motion.div
      initial={shouldReduce ? false : { opacity: 0, y: 20 }}
      animate={shouldReduce ? {} : { opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center w-full max-w-md gap-6"
    >
      <div className="card w-full text-center">
        <div className="text-xl font-semibold" data-testid="name">{employee}</div>
        <div className="text-lg">{time.toLocaleString()}</div>
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
      <div className="card w-full">
        <h3 className="font-semibold mb-2">Today's Timeline</h3>
        <ul className="relative border-l border-sapphire pl-4 space-y-2">
          {timeline.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute -left-2 top-1 w-3 h-3 bg-sapphire rounded-full"></span>
              {actions.find((a) => a.kind === e.kind)?.icon}{' '}
              {actions.find((a) => a.kind === e.kind)?.label} -{' '}
              {new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  )
}
