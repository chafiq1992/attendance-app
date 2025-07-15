import { motion } from 'framer-motion'

const titles = {
  '/': 'Daily Attendance',
  '/monthly-sheets': 'Monthly Report',
  '/period-summary': 'Period Summary',
  '/performance': 'Performance',
  '/admin-dashboard': 'Admin Dashboard',
  '/employee-dashboard': 'Employee Dashboard'
}

export default function Header() {
  const path = window.location.pathname
  let title = 'Attendance'
  for (const p of Object.keys(titles)) {
    if (path.startsWith(p)) {
      title = titles[p]
      break
    }
  }
  return (
    <header className="fixed top-0 left-0 right-0 z-20 bg-gradient-to-r from-[#004aad] to-[#0e5dad] shadow flex items-center justify-between px-4 h-[60px] md:h-[72px] text-white">
      <a href="/" className="flex items-center gap-2">
        <img src="/favicon.ico" alt="Logo" className="w-8 h-8 rounded" />
      </a>
      <motion.h1
        key={title}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2 }}
        className="font-bold text-base md:text-lg text-center"
      >
        {title}
      </motion.h1>
      <div className="flex items-center gap-4">
        <div className="relative">
          <span>🔔</span>
          <span className="absolute -top-1 -right-2 bg-red-500 text-xs rounded-full px-1">1</span>
        </div>
        <div className="w-8 h-8 bg-white text-sapphire rounded-full flex items-center justify-center font-semibold text-sm">JD</div>
      </div>
    </header>
  )
}
