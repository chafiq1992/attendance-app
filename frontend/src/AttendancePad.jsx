import { useEffect, useState } from 'react'

export default function AttendancePad() {
  const [employee, setEmployee] = useState('')
  const [time, setTime] = useState(new Date())

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
    }).catch(console.error)
  }

  return (
    <div className="flex flex-col items-center w-full max-w-md gap-6">
      <div className="text-lg font-semibold" data-testid="name">{employee}</div>
      <div>{time.toLocaleString()}</div>
      <div className="grid grid-cols-2 gap-4 w-full">
        <button className="bg-green-600 text-white rounded-lg p-6 text-xl" onClick={() => send('clockin')}>✅ Clock In</button>
        <button className="bg-red-500 text-white rounded-lg p-6 text-xl" onClick={() => send('clockout')}>🕔 Clock Out</button>
      </div>
      <div className="grid grid-cols-2 gap-4 w-full">
        <button className="bg-orange-500 text-white rounded-lg p-6 text-xl" onClick={() => send('startbreak')}>🛑 Start Break</button>
        <button className="bg-blue-600 text-white rounded-lg p-6 text-xl" onClick={() => send('endbreak')}>✅ End Break</button>
      </div>
      <div className="grid grid-cols-2 gap-4 w-full">
        <button className="bg-purple-700 text-white rounded-lg p-6 text-xl" onClick={() => send('startextra')}>➕ Start Extra Hours</button>
        <button className="bg-fuchsia-700 text-white rounded-lg p-6 text-xl" onClick={() => send('endextra')}>🛑 End Extra Hours</button>
      </div>
    </div>
  )
}
