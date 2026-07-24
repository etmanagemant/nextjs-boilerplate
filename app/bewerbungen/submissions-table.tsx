'use client'
import { useState } from 'react'
import { deleteSubmission, updateSubmissionStatus } from './page'

const STATUS_CONFIG: Record<string, { color: string; bgColor: string; label: string; icon: string }> = {
  new: { color: '#0066cc', bgColor: 'rgba(0, 102, 204, 0.1)', label: 'Neu', icon: '⭐' },
  reviewing: { color: '#ff9500', bgColor: 'rgba(255, 149, 0, 0.1)', label: 'In Review', icon: '🔍' },
  accepted: { color: '#34c759', bgColor: 'rgba(52, 199, 89, 0.1)', label: 'Akzeptiert', icon: '✅' },
  rejected: { color: '#ff3b30', bgColor: 'rgba(255, 59, 48, 0.1)', label: 'Abgelehnt', icon: '❌' },
  contacted: { color: '#5ac8fa', bgColor: 'rgba(90, 200, 250, 0.1)', label: 'Kontaktiert', icon: '📞' },
}

export default function SubmissionsTable({ submissions }: { submissions: any[] }) {
  const [items, setItems] = useState(submissions)
  const [loading, setLoading] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const handleDelete = async (id: string) => {
    if (!confirm('Wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) return
    setLoading(id)
    const result = await deleteSubmission(id)
    if (!result.error) {
      setItems(items.filter(i => i.id !== id))
    } else {
      alert('Fehler beim Löschen: ' + result.error)
    }
    setLoading(null)
  }

  const handleStatusChange = async (id: string, newStatus: string) => {
    setLoading(id)
    const result = await updateSubmissionStatus(id, newStatus)
    if (!result.error) {
      setItems(items.map(i => i.id === id ? { ...i, status: newStatus } : i))
    } else {
      alert('Fehler beim Aktualisieren: ' + result.error)
    }
    setLoading(null)
  }

  const filteredItems = items.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.phone?.includes(searchTerm)
  )

  return (
    <div>
      {/* Search Bar */}
      <div style={{ marginBottom: 28 }}>
        <input
          type="text"
          placeholder="🔍 Nach Name, E-Mail oder Telefon suchen..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 16px',
            borderRadius: '8px',
            border: '2px solid #333',
            backgroundColor: '#0A0A0A',
            color: '#fff',
            fontSize: '0.95rem',
            transition: 'all 0.2s',
            outline: 'none',
            boxSizing: 'border-box'
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#C9A86A'
            e.currentTarget.style.boxShadow = '0 0 12px rgba(201, 168, 106, 0.2)'
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = '#333'
            e.currentTarget.style.boxShadow = 'none'
          }}
        />
      </div>

      {/* Stats Bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 16,
        marginBottom: 32
      }}>
        {Object.entries(STATUS_CONFIG).map(([status, config]) => {
          const count = items.filter(i => (i.status || 'new') === status).length
          return (
            <div
              key={status}
              style={{
                padding: '12px 16px',
                backgroundColor: config.bgColor,
                border: `1px solid ${config.color}`,
                borderRadius: '8px',
                textAlign: 'center'
              }}
            >
              <div style={{ fontSize: '1.2rem', marginBottom: 4 }}>{config.icon}</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, color: config.color }}>
                {count}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#888', marginTop: 4 }}>
                {config.label}
              </div>
            </div>
          )
        })}
      </div>

      {/* Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
        gap: 20
      }}>
        {filteredItems.length === 0 ? (
          <div style={{
            gridColumn: '1 / -1',
            padding: '40px 32px',
            textAlign: 'center',
            backgroundColor: 'rgba(201, 168, 106, 0.05)',
            borderRadius: '12px',
            border: '1px dashed #C9A86A'
          }}>
            <p style={{ color: '#888', margin: 0, fontSize: '1rem' }}>
              Keine Bewerbungen gefunden
            </p>
          </div>
        ) : (
          filteredItems.map((submission) => {
            const statusConfig = STATUS_CONFIG[submission.status || 'new']
            const isExpanded = expandedId === submission.id
            const isLoading = loading === submission.id

            return (
              <div
                key={submission.id}
                style={{
                  backgroundColor: '#0F0F0F',
                  border: '1px solid #222',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  transition: 'all 0.3s ease',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                  cursor: 'pointer',
                  opacity: isLoading ? 0.6 : 1
                }}
                onMouseEnter={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.borderColor = '#C9A86A'
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(201, 168, 106, 0.15)'
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#222'
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.4)'
                }}
              >
                {/* Card Header */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : submission.id)}
                  style={{
                    padding: '16px',
                    borderBottom: '1px solid #222',
                    backgroundColor: 'rgba(15, 15, 15, 0.8)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ margin: '0 0 4px 0', fontSize: '1.2rem', fontWeight: 700, color: '#E2C48A' }}>
                        {submission.name}
                      </h3>
                      <p style={{ margin: '4px 0', fontSize: '0.85rem', color: '#888' }}>
                        {submission.email || 'Keine Email'}
                      </p>
                      <p style={{ margin: '2px 0 0 0', fontSize: '0.85rem', color: '#666' }}>
                        📞 {submission.phone || '—'}
                      </p>
                    </div>
                    <div
                      onClick={(e) => {
                        e.stopPropagation()
                      }}
                    >
                      <select
                        value={submission.status || 'new'}
                        onChange={(e) => {
                          e.stopPropagation()
                          handleStatusChange(submission.id, e.target.value)
                        }}
                        disabled={isLoading}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: `2px solid ${statusConfig.color}`,
                          backgroundColor: statusConfig.color,
                          color: 'white',
                          cursor: isLoading ? 'not-allowed' : 'pointer',
                          fontWeight: 600,
                          fontSize: '0.85rem',
                          opacity: isLoading ? 0.5 : 1
                        }}
                      >
                        {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                          <option key={key} value={key}>
                            {config.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Meta Info */}
                  <div style={{ marginTop: 12, fontSize: '0.8rem', color: '#666', display: 'flex', justifyContent: 'space-between' }}>
                    <span>
                      Eingereicht: {new Date(submission.receivedAt).toLocaleString('de-DE')}
                    </span>
                    <span>
                      {isExpanded ? '▼' : '▶'}
                    </span>
                  </div>
                </div>

                {/* Expandable Details */}
                {isExpanded && (
                  <div style={{ padding: '16px', backgroundColor: '#0A0A0A', borderTop: '1px solid #222' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', fontSize: '0.9rem', marginBottom: 16 }}>
                      {submission.birthday && (
                        <>
                          <div style={{ color: '#666' }}>📅 Geburtstag:</div>
                          <div style={{ color: '#ccc' }}>{submission.birthday}</div>
                        </>
                      )}
                      {submission.contactMethod && (
                        <>
                          <div style={{ color: '#666' }}>💬 Kontakt:</div>
                          <div style={{ color: '#ccc' }}>
                            {submission.contactMethod === 'whatsapp' ? 'WhatsApp' : 'Telegram'}
                          </div>
                        </>
                      )}
                      {submission.showFace !== undefined && (
                        <>
                          <div style={{ color: '#666' }}>🎭 Gesicht zeigen:</div>
                          <div style={{ color: '#ccc' }}>{submission.showFace ? 'Ja' : 'Nein'}</div>
                        </>
                      )}
                      {submission.experience && (
                        <>
                          <div style={{ color: '#666' }}>⭐ Erfahrung:</div>
                          <div style={{ color: '#ccc' }}>{submission.experience}</div>
                        </>
                      )}
                      {submission.start && (
                        <>
                          <div style={{ color: '#666' }}>🚀 Start:</div>
                          <div style={{ color: '#ccc' }}>{submission.start}</div>
                        </>
                      )}
                      {submission.availability && (
                        <>
                          <div style={{ color: '#666' }}>⏰ Verfügbar:</div>
                          <div style={{ color: '#ccc' }}>{submission.availability}</div>
                        </>
                      )}
                    </div>

                    {submission.social && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ color: '#666', fontSize: '0.9rem', marginBottom: 4 }}>📱 Social Media:</div>
                        <div style={{ color: '#ccc', fontSize: '0.85rem', padding: '8px 12px', backgroundColor: 'rgba(201, 168, 106, 0.05)', borderRadius: '6px', borderLeft: '2px solid #C9A86A' }}>
                          {submission.social}
                        </div>
                      </div>
                    )}

                    {submission.category && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ color: '#666', fontSize: '0.9rem', marginBottom: 4 }}>🎯 Kategorie:</div>
                        <div style={{ color: '#ccc', fontSize: '0.85rem' }}>{submission.category}</div>
                      </div>
                    )}

                    {submission.message && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ color: '#666', fontSize: '0.9rem', marginBottom: 4 }}>💭 Nachricht:</div>
                        <div style={{ color: '#ccc', fontSize: '0.85rem', padding: '8px 12px', backgroundColor: 'rgba(201, 168, 106, 0.05)', borderRadius: '6px', maxHeight: '120px', overflow: 'auto' }}>
                          {submission.message}
                        </div>
                      </div>
                    )}

                    {submission.goals && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ color: '#666', fontSize: '0.9rem', marginBottom: 4 }}>🎪 Ziele:</div>
                        <div style={{ color: '#ccc', fontSize: '0.85rem', padding: '8px 12px', backgroundColor: 'rgba(201, 168, 106, 0.05)', borderRadius: '6px' }}>
                          {submission.goals}
                        </div>
                      </div>
                    )}

                    {submission.agency && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ color: '#666', fontSize: '0.9rem', marginBottom: 4 }}>🏢 Plattformen:</div>
                        <div style={{ color: '#ccc', fontSize: '0.85rem' }}>{submission.agency}</div>
                      </div>
                    )}

                    {submission.variant && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ color: '#666', fontSize: '0.9rem' }}>Variant: {submission.variant}</div>
                      </div>
                    )}

                    {/* Delete Button */}
                    <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #222' }}>
                      <button
                        onClick={() => handleDelete(submission.id)}
                        disabled={isLoading}
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          backgroundColor: '#ff3b30',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: isLoading ? 'not-allowed' : 'pointer',
                          fontSize: '0.9rem',
                          fontWeight: 600,
                          transition: 'all 0.2s',
                          opacity: isLoading ? 0.6 : 1
                        }}
                        onMouseEnter={(e) => {
                          if (!isLoading) e.currentTarget.style.backgroundColor = '#ff5252'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#ff3b30'
                        }}
                      >
                        {isLoading ? '⏳ Löschen...' : '🗑️ Löschen'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
