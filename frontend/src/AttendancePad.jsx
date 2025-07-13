import { useEffect, useState } from 'react'
import RippleButton from './components/RippleButton'
import { motion, useReducedMotion } from 'framer-motion'
import { useToast } from './components/Toast'

export default function AttendancePad() {
  const [employee, setEmployee] = useState('')
  const [time, setTime] = useState(new Date())
  const toast = useToast()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setEmployee(params.get('employee') || params.get('driver') || '')
  }, [])

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const send = (action) => {
    if (!employee) return
    fetch('/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee, action })
    })
      .then((r) => {
        if (!r.ok) throw new Error('Request failed')
        toast('Saved!')
      })
      .catch(() => toast('Error', 'error'))
  }

  const shouldReduce = useReducedMotion()

  return (
    <motion.div
      initial={shouldReduce ? false : { opacity: 0, y: 20 }}
      animate={shouldReduce ? {} : { opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center w-full max-w-md gap-6 bg-white dark:bg-gray-700 rounded-xl p-6 shadow"
    >
      <div className="text-lg font-semibold" data-testid="name">{employee}</div>
      <div>{time.toLocaleString()}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
        <RippleButton className="bg-green-600 text-white rounded-xl shadow p-6 text-xl" onClick={() => send('clockin')}>✅ Clock In</RippleButton>
        <RippleButton className="bg-red-500 text-white rounded-xl shadow p-6 text-xl" onClick={() => send('clockout')}>🕔 Clock Out</RippleButton>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
        <RippleButton className="bg-orange-500 text-white rounded-xl shadow p-6 text-xl" onClick={() => send('startbreak')}>🛑 Start Break</RippleButton>
        <RippleButton className="bg-blue-600 text-white rounded-xl shadow p-6 text-xl" onClick={() => send('endbreak')}>✅ End Break</RippleButton>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
        <RippleButton className="bg-purple-700 text-white rounded-xl shadow p-6 text-xl" onClick={() => send('startextra')}>➕ Start Extra Hours</RippleButton>
        <RippleButton className="bg-fuchsia-700 text-white rounded-xl shadow p-6 text-xl" onClick={() => send('endextra')}>🛑 End Extra Hours</RippleButton>
      </div>
    </motion.div>
  )
}
