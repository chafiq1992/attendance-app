import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { format } from 'date-fns'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/dist/style.css'
import { useToast } from './components/Toast'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'

export default function AdminDashboard() {
  const toast = useToast()
  const qc = useQueryClient()
  const [month, setMonth] = useState(new Date())
  const monthStr = format(month, 'yyyy-MM')

  const { data } = useQuery({
    queryKey: ['events', monthStr],
    queryFn: async () => {
      const res = await axios.get('/events', { params: { month: monthStr } })
      return res.data
    },
  })

  const mutation = useMutation({
    mutationFn: async ({ id, timestamp }) => {
      await axios.patch(`/events/${id}`, { timestamp })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events', monthStr] })
      toast('Saved!')
    },
  })

  const employees = {}
  ;(data || []).forEach((e) => {
    if (!employees[e.employee_id]) employees[e.employee_id] = {}
    const day = new Date(e.timestamp).getUTCDate()
    employees[e.employee_id][day] = e
  })

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const columns = [
    {
      header: 'Employee',
      accessorKey: 'employee',
    },
    ...Array.from({ length: daysInMonth }, (_, i) => ({
      header: i + 1,
      accessorKey: `d${i + 1}`,
    })),
  ]

  const dataRows = Object.keys(employees).map((emp) => {
    const row = { employee: emp }
    for (let d = 1; d <= daysInMonth; d++) {
      row[`d${d}`] = employees[emp][d]?.kind || ''
    }
    return row
  })

  const table = useReactTable({ data: dataRows, columns, getCoreRowModel: getCoreRowModel() })

  const handleCellClick = (cell) => {
    const original = employees[cell.row.original.employee][parseInt(cell.column.id.slice(1))]
    if (!original) return
    const ts = prompt('New timestamp ISO', original.timestamp)
    if (ts) {
      mutation.mutate({ id: original.id, timestamp: ts })
    }
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold">Admin Dashboard</h2>
      <DayPicker mode="single" selected={month} onMonthChange={setMonth} onSelect={setMonth} captionLayout="dropdown" />
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id} className="border p-1">
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="border p-1 cursor-pointer"
                    onDoubleClick={() => handleCellClick(cell)}
                  >
                    {flexRender(cell.column.columnDef.cell ?? cell.column.columnDef.header, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
