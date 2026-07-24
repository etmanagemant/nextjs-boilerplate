'use server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabaseServer'
import { createClient as createAnonClient } from '@supabase/supabase-js'
import SubmissionsTable from './submissions-table'

export async function deleteSubmission(id: string) {
  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!supabaseUrl || !supabaseAnonKey) return { error: 'Config missing' }
  
  const client = createAnonClient(supabaseUrl, supabaseAnonKey)
  const { error } = await client
    .from('funnel_submissions')
    .delete()
    .eq('id', id)
  
  return { error }
}

export async function updateSubmissionStatus(id: string, status: string) {
  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!supabaseUrl || !supabaseAnonKey) return { error: 'Config missing' }
  
  const client = createAnonClient(supabaseUrl, supabaseAnonKey)
  const { error } = await client
    .from('funnel_submissions')
    .update({ status })
    .eq('id', id)
  
  return { error }
}

export default async function Bewerbungen() {
  // ========== AUTH CHECK ==========
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/login')
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  let submissions: any[] = []

  if (supabaseUrl && supabaseAnonKey) {
    try {
      const client = createAnonClient(supabaseUrl, supabaseAnonKey)
      const { data, error } = await client
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
    <main style={{padding:'32px 20px',maxWidth:'1400px',margin:'0 auto'}}>
      <div style={{marginBottom:32}}>
        <h1 style={{
          margin:0,
          fontSize:'2.5rem',
          fontWeight:700,
          color:'#E2C48A',
          letterSpacing:'-0.5px'
        }}>
          Bewerbungen Dashboard
        </h1>
        <p style={{
          margin:'8px 0 0 0',
          color:'#888',
          fontSize:'0.95rem'
        }}>
          {submissions.length} {submissions.length === 1 ? 'Bewerbung' : 'Bewerbungen'} insgesamt
        </p>
      </div>

      {submissions.length === 0 ? (
        <div style={{
          padding:'48px 32px',
          border:'2px dashed #333',
          borderRadius:'12px',
          textAlign:'center',
          backgroundColor:'rgba(15, 15, 15, 0.5)'
        }}>
          <p style={{color:'#666',fontSize:'1.05rem',margin:0}}>
            Noch keine Bewerbungen eingegangen
          </p>
        </div>
      ) : (
        <SubmissionsTable submissions={submissions} />
      )}
    </main>
  )
}
