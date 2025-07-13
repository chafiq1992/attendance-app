import AttendancePad from './AttendancePad'
import AdminDashboard from './AdminDashboard'
import EmployeeDashboard from './EmployeeDashboard'
import { motion, useReducedMotion } from 'framer-motion'

export default function App() {
  const shouldReduce = useReducedMotion()
  const path = window.location.pathname
  if (path.startsWith('/admin-dashboard')) {
    return <AdminDashboard />
  }
  if (path.startsWith('/employee-dashboard')) {
    return <EmployeeDashboard />
  }
  return (
    <motion.div
      initial={shouldReduce ? false : { opacity: 0 }}
      animate={shouldReduce ? {} : { opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center p-4 gap-4 min-h-screen bg-background"
    >
      <h2 className="text-2xl font-bold">Employee Attendance</h2>
      <AttendancePad />
    </motion.div>
  )
}
