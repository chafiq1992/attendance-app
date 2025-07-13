import { motion } from 'framer-motion'

const items = [
  { path: '/', label: 'Daily', icon: '📅' },
  { path: '/monthly-sheets', label: 'Monthly', icon: '🗓️' },
  { path: '/period-summary', label: 'Periods', icon: '📊' },
  { path: '/performance', label: 'Performance', icon: '🚀' },
]

export default function NavBar({ path }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/10 backdrop-blur-md px-2 py-1 flex justify-around text-sm">
      {items.map((it) => (
        <a
          key={it.path}
          href={it.path}
          className="relative flex flex-col items-center px-2 py-1"
        >
          <span>{it.icon}</span>
          <span>{it.label}</span>
          {path.startsWith(it.path) && (
            <motion.span
              layoutId="nav-indicator"
              className="absolute -bottom-1 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full bg-sapphire"
            />
          )}
        </a>
      ))}
    </nav>
  )
}

