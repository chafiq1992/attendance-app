import React from 'react'

const colors = ['bg-blue-500', 'bg-green-500', 'bg-red-500', 'bg-orange-500']

export default function TimelineEntry({ icon, label, time, index }) {
  const color = colors[index % colors.length]
  return (
    <div className={`flex items-center text-white px-2 py-1 rounded ${color}`}>
      <span className="mr-2">{icon}</span>
      <span className="flex-1">{label}</span>
      <span className="font-mono">{time}</span>
    </div>
  )
}
