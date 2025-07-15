import { useEffect, useState } from 'react'
import axios from 'axios'

export default function SettingsLogs() {
  const [settings, setSettings] = useState({})
  const [users, setUsers] = useState([])
  const [newUser, setNewUser] = useState('')
  const [logs, setLogs] = useState([])

  const fetchData = async () => {
    try {
      const s = await axios.get('/api/admin/settings')
      setSettings(s.data)
      const u = await axios.get('/api/admin/users')
      setUsers(u.data)
      const l = await axios.get('/api/admin/logs')
      setLogs(l.data)
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 30000)
    return () => clearInterval(id)
  }, [])

  const saveSetting = async (key, value) => {
    await axios.post('/api/admin/settings', { key, value })
    fetchData()
  }

  const addUser = async () => {
    if (!newUser) return
    await axios.post('/api/admin/users', { username: newUser })
    setNewUser('')
    fetchData()
  }

  const deleteUser = async (id) => {
    await axios.delete(`/api/admin/users/${id}`)
    fetchData()
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="font-semibold">App Settings</h3>
        <div className="flex flex-col space-y-2 md:flex-row md:space-x-4 md:space-y-0">
          <label className="flex items-center space-x-2">
            <span>Work Day Hours</span>
            <input
              type="number"
              className="bg-white/10 p-1 rounded w-24 text-right"
              value={settings.WORK_DAY_HOURS || ''}
              onChange={e => saveSetting('WORK_DAY_HOURS', e.target.value)}
            />
          </label>
          <label className="flex items-center space-x-2">
            <span>Break Grace (min)</span>
            <input
              type="number"
              className="bg-white/10 p-1 rounded w-24 text-right"
              value={settings.GRACE_PERIOD_MIN || ''}
              onChange={e => saveSetting('GRACE_PERIOD_MIN', e.target.value)}
            />
          </label>
          <label className="flex items-center space-x-2">
            <span>Penalty Bonus (min)</span>
            <input
              type="number"
              className="bg-white/10 p-1 rounded w-24 text-right"
              value={settings.UNDER_TIME_PENALTY_MIN || ''}
              onChange={e => saveSetting('UNDER_TIME_PENALTY_MIN', e.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">Manage Admin Users</h3>
        <div className="flex space-x-2">
          <input
            className="bg-white/10 p-1 rounded"
            value={newUser}
            onChange={e => setNewUser(e.target.value)}
            placeholder="Username"
          />
          <button className="px-2 py-1 bg-sapphire text-white rounded" onClick={addUser}>Add</button>
        </div>
        <ul className="list-disc pl-4">
          {users.map(u => (
            <li key={u.id} className="flex items-center space-x-2">
              <span>{u.username}</span>
              <button className="text-red-500 underline" onClick={() => deleteUser(u.id)}>Remove</button>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">Admin Action Log</h3>
        <table className="min-w-full text-sm table-hover">
          <thead>
            <tr>
              <th className="border px-2">When</th>
              <th className="border px-2">Action</th>
              <th className="border px-2">Data</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(l => (
              <tr key={l.id}>
                <td className="border px-2">{new Date(l.created_at).toLocaleString()}</td>
                <td className="border px-2">{l.action}</td>
                <td className="border px-2 whitespace-pre-wrap">{l.data}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
