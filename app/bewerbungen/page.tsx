import { createClient } from '@supabase/supabase-js'

export default async function Bewerbungen() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  let submissions: any[] = []

  if (supabaseUrl && supabaseAnonKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseAnonKey)
      const { data, error } = await supabase
        .from('funnel_submissions')
        .select('*')
        .order('receivedAt', { ascending: false })

      if (error) {
        console.error('Supabase query error:', error)
      } else {
        submissions = data || []
      }
    } catch (err) {
      console.error('Supabase fetch failed:', err)
    }
  }

  return (
    <main style={{padding:24}}>
      <h1 style={{marginTop:0}}>Bewerbungen ({submissions.length})</h1>
      {submissions.length === 0 ? (
        <p style={{color:'#888'}}>Keine Bewerbungen gefunden</p>
      ) : (
        <ul>
          {submissions.map((s, idx) => (
            <li key={s.id || idx} style={{padding:12,borderBottom:'1px solid #222'}}>
              <div style={{fontWeight:700}}>{s.name} <span style={{fontWeight:400}}>&lt;{s.email || 'keine'}&gt;</span></div>
              <div style={{fontSize:13,color:'#888'}}>{s.variant || ''} — {new Date(s.receivedAt).toLocaleString('de-DE')}</div>
              <pre style={{whiteSpace:'pre-wrap',marginTop:8,fontSize:12}}>{JSON.stringify(s, null, 2)}</pre>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
