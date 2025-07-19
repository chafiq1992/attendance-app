import { useEffect, useState } from 'react'
import axios from 'axios'

export default function useSettings() {
  const [settings, setSettings] = useState({ WORK_DAY_HOURS: 8, GRACE_PERIOD_MIN: 20 })
  useEffect(() => {
    axios.get('/api/admin/settings').then(res => {
      setSettings(prev => ({ ...prev, ...res.data }))
    }).catch(() => {})
  }, [])
  return settings
}
