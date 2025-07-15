import React from 'react'

const tabs = [
  { key: 'overview', label: 'Overview' },
  { key: 'directory', label: 'Employees Directory' },
  { key: 'edit', label: 'Edit Records' },
  { key: 'payout', label: 'Payout Summary' },
  { key: 'settings', label: 'Settings & Logs' },
]

export default function AdminHeader({ tab, onTabChange }) {
  return (
    <header className="fixed top-0 left-0 right-0 z-20 bg-gradient-to-r from-[#004aad] to-[#0e5dad] shadow">
      <nav className="max-w-screen-xl mx-auto flex space-x-2 overflow-x-auto p-2">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => onTabChange(t.key)}
            className={`tab ${tab === t.key ? 'tab-active' : 'hover:bg-white/10'}`}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </header>
  )
}
