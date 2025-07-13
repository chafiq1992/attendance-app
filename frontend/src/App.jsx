import AttendancePad from './AttendancePad'

export default function App() {
  return (
    <div className="flex flex-col items-center p-4 gap-4">
      <h2 className="text-2xl font-bold">Employee Attendance</h2>
      <AttendancePad />
    </div>
  )
}
