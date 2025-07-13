import { useState } from 'react'

export default function MonthlySheets() {
  const months = [
    { label: 'July 2025', rows: sampleRows() },
    { label: 'June 2025', rows: sampleRows() },
    { label: 'May 2025', rows: sampleRows() },
  ]
  const [open, setOpen] = useState(null)
  return (
    <div className="p-4 space-y-4 overflow-auto h-full scrollbar-thin scrollbar-thumb-sapphire/50">
      <div className="sticky top-0 z-10">
        <div className="card">
          <div className="bg-sapphire text-center -mx-6 -mt-6 rounded-t-xl py-2 text-white font-semibold">
            {months[0].label}
          </div>
          <Table rows={months[0].rows} />
        </div>
      </div>
      {months.slice(1).map((m, idx) => (
        <div key={m.label} className="card">
          <button
            onClick={() => setOpen(open === idx ? null : idx)}
            className="w-full text-left font-semibold mb-2"
          >
            {m.label}
          </button>
          {open === idx && <Table rows={m.rows} />}
        </div>
      ))}
    </div>
  )
}

function Table({ rows }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-white/10">
        <tr>
          <th className="p-1">Date</th>
          <th className="p-1">In</th>
          <th className="p-1">Out</th>
          <th className="p-1">Break Start</th>
          <th className="p-1">Break End</th>
          <th className="p-1">Extra Start</th>
          <th className="p-1">Extra End</th>
          <th className="p-1">Total Hrs</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr
            key={r.date}
            className={
              (i % 2 ? 'bg-white/5' : '') +
              (r.weekend ? ' bg-violet/10' : '') +
              (r.holiday ? ' bg-amber-200/20' : '')
            }
          >
            <td className="p-1 text-center whitespace-nowrap">{r.date}</td>
            <td className="p-1 text-center">{r.in}</td>
            <td className="p-1 text-center">{r.out}</td>
            <td className="p-1 text-center">{r.breakStart}</td>
            <td className="p-1 text-center">{r.breakEnd}</td>
            <td className="p-1 text-center">{r.extraStart}</td>
            <td className="p-1 text-center">{r.extraEnd}</td>
            <td className="p-1 text-center">{r.total}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function sampleRows() {
  return [
    {
      date: '2025-07-01',
      in: '09:00',
      out: '17:00',
      breakStart: '12:00',
      breakEnd: '13:00',
      extraStart: '',
      extraEnd: '',
      total: '8',
      weekend: false,
      holiday: false,
    },
    {
      date: '2025-07-05',
      in: '09:00',
      out: '17:00',
      breakStart: '12:00',
      breakEnd: '13:00',
      extraStart: '',
      extraEnd: '',
      total: '8',
      weekend: true,
      holiday: false,
    },
    {
      date: '2025-07-07',
      in: '09:00',
      out: '17:00',
      breakStart: '12:00',
      breakEnd: '13:00',
      extraStart: '',
      extraEnd: '',
      total: '8',
      weekend: false,
      holiday: true,
    },
  ]
}
