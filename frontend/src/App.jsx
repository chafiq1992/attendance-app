import AttendancePad from './AttendancePad'
import { motion, useReducedMotion } from 'framer-motion'

export default function App() {
  const shouldReduce = useReducedMotion()
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
