export function formatHours(hours) {
  const totalSeconds = Math.round(hours * 3600);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function formatMs(ms) {
  return formatHours(ms / 3600000);
}

export function formatHoursHM(hours) {
  const totalMinutes = Math.round(hours * 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  const pad = (n) => n.toString().padStart(2, '0')
  return `${pad(h)}:${pad(m)}`
}

export function formatHoursHMLabel(hours) {
  const [h, m] = formatHoursHM(hours).split(':')
  return `${Number(h)} h ${m} m`
}

export function formatDaysHM(days) {
  const wholeDays = Math.floor(days)
  const remainingHours = (days - wholeDays) * 8
  const h = Math.floor(remainingHours)
  const m = Math.round((remainingHours - h) * 60)
  const pad = (n) => n.toString().padStart(2, '0')
  return `${wholeDays} day${wholeDays === 1 ? '' : 's'} ${h} h ${pad(m)} m`
}

export function stripPreClockin(events) {
  const sorted = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  const idx = sorted.findIndex(e => e.kind === 'clockin' || e.kind === 'in')
  if (idx === -1) return []
  return sorted.slice(idx)
}
