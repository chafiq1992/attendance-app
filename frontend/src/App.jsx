import AttendancePad from './AttendancePad'
import AdminDashboard from './AdminDashboard'
import EmployeeDashboard from './EmployeeDashboard'
import MonthlySheets from './MonthlySheets'
import PeriodSummary from './PeriodSummary'
import Performance from './Performance'
import NavBar from './components/NavBar'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

export default function App() {
  const shouldReduce = useReducedMotion()
  const path = window.location.pathname
  if (path.startsWith('/admin-dashboard')) return <AdminDashboard />
  if (path.startsWith('/employee-dashboard')) return <EmployeeDashboard />

  let Page = AttendancePad
  if (path.startsWith('/monthly-sheets')) Page = MonthlySheets
  else if (path.startsWith('/period-summary')) Page = PeriodSummary
  else if (path.startsWith('/performance')) Page = Performance

  return (
    <>
      <AnimatePresence mode="wait">
        <motion.div
          key={path}
          initial={shouldReduce ? false : { opacity: 0, x: 50 }}
          animate={shouldReduce ? {} : { opacity: 1, x: 0 }}
          exit={shouldReduce ? {} : { opacity: 0, x: -50 }}
          transition={{ duration: 0.3 }}
          className="pt-4 pb-16 min-h-screen"
        >
          <Page />
        </motion.div>
      </AnimatePresence>
      <NavBar path={path} />
    </>
  )
}
