import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

export default function Snackbar({ action, onClose }) {
  useEffect(() => {
    if (!action) return
    const id = setTimeout(onClose, 5000)
    return () => clearTimeout(id)
  }, [action, onClose])

  return (
    <AnimatePresence>
      {action && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-md rounded-full px-4 py-2 flex items-center gap-2 z-50"
        >
          <span>{action.message}</span>
          <button onClick={action.undo} className="underline">
            Undo
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
