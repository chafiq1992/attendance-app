export function Progress({ value, label }) {
  return (
    <div className="w-full bg-gray-200 rounded">
      <div
        className="bg-blue-600 text-white text-xs px-1 py-0.5 rounded"
        style={{ width: `${Math.round(value * 100)}%` }}
      >
        {label}
      </div>
    </div>
  )
}
