'use client'
import { useState } from 'react'
import { deleteSubmission, updateSubmissionStatus } from './page'

const STATUS_COLORS: Record<string, string> = {
  new: '#0066cc',
  reviewing: '#ff9500',
  accepted: '#34c759',
  rejected: '#ff3b30',
  contacted: '#5ac8fa',
}

const STATUS_LABELS: Record<string, string> = {
  new: 'Neu',
  reviewing: 'In Review',
  accepted: 'Akzeptiert',
  rejected: 'Abgelehnt',
  contacted: 'Kontaktiert',
}

export default function SubmissionsTable({ submissions }: { submissions: any[] }) {
  const [items, setItems] = useState(submissions)
  const [loading, setLoading] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    if (!confirm('Wirklich löschen?')) return
    setLoading(id)
    const result = await deleteSubmission(id)
    if (!result.error) {
      setItems(items.filter(i => i.id !== id))
    } else {
      alert('Fehler beim Löschen')
    }
    setLoading(null)
  }

  const handleStatusChange = async (id: string, status: string) => {
    setLoading(id)
    const result = await updateSubmissionStatus(id, status)
    if (!result.error) {
      setItems(items.map(i => i.id === id ? { ...i, status } : i))
    } else {
      alert('Fehler beim Aktualisieren')
    }
    setLoading(null)
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '14px'
      }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #333', backgroundColor: '#f5f5f5' }}>
            <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>Name</th>
            <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>Email</th>
            <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>Telefon</th>
            <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>Status</th>
            <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>Eingereicht</th>
            <th style={{ padding: '12px', textAlign: 'center', fontWeight: 600 }}>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '12px', fontWeight: 600 }}>{s.name}</td>
              <td style={{ padding: '12px', color: '#666' }}>{s.email || '—'}</td>
              <td style={{ padding: '12px', color: '#666' }}>{s.phone || '—'}</td>
              <td style={{ padding: '12px' }}>
                <select
                  value={s.status || 'new'}
                  onChange={(e) => handleStatusChange(s.id, e.target.value)}
                  disabled={loading === s.id}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '4px',
                    border: `2px solid ${STATUS_COLORS[s.status || 'new']}`,
                    backgroundColor: STATUS_COLORS[s.status || 'new'],
                    color: 'white',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '12px'
                  }}
                >
                  {Object.entries(STATUS_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </td>
              <td style={{ padding: '12px', color: '#666', fontSize: '13px' }}>
                {new Date(s.receivedAt).toLocaleString('de-DE')}
              </td>
              <td style={{ padding: '12px', textAlign: 'center' }}>
                <button
                  onClick={() => handleDelete(s.id)}
                  disabled={loading === s.id}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#ff3b30',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 600,
                    opacity: loading === s.id ? 0.5 : 1
                  }}
                >
                  {loading === s.id ? '...' : 'Löschen'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Details Bereich */}
      <div style={{ marginTop: 40 }}>
        <h2 style={{ marginBottom: 16 }}>Details</h2>
        {items.map((s) => (
          <details key={s.id} style={{ marginBottom: 16, border: '1px solid #ddd', borderRadius: '4px', padding: 12 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: 8 }}>
              {s.name} — {new Date(s.receivedAt).toLocaleString('de-DE')}
            </summary>
            <div style={{ fontSize: '13px', color: '#666', whiteSpace: 'pre-wrap', marginTop: 8 }}>
              <p><strong>Geburtstag:</strong> {s.birthday || '—'}</p>
              <p><strong>Kontaktmethode:</strong> {s.contactMethod || '—'}</p>
              <p><strong>Gesicht zeigen:</strong> {s.showFace ? 'Ja' : 'Nein'}</p>
              {s.social && <p><strong>Social Media:</strong> {s.social}</p>}
              {s.category && <p><strong>Kategorie:</strong> {s.category}</p>}
              {s.experience && <p><strong>Erfahrung:</strong> {s.experience}</p>}
              {s.start && <p><strong>Startzeit:</strong> {s.start}</p>}
              {s.message && <p><strong>Nachricht:</strong> {s.message}</p>}
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}
