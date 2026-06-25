'use server'
import { createClient } from '@supabase/supabase-js'
import SubmissionsTable from './submissions-table'

export async function deleteSubmission(id: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!supabaseUrl || !supabaseAnonKey) return { error: 'Config missing' }
  
  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  const { error } = await supabase
    .from('funnel_submissions')
    .delete()
    .eq('id', id)
  
  return { error }
}

export async function updateSubmissionStatus(id: string, status: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!supabaseUrl || !supabaseAnonKey) return { error: 'Config missing' }
  
  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  const { error } = await supabase
    .from('funnel_submissions')
    .update({ status })
    .eq('id', id)
  
  return { error }
}

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
    <main style={{padding:24,maxWidth:'1200px',margin:'0 auto'}}>
      <h1 style={{marginTop:0,marginBottom:24}}>Bewerbungen ({submissions.length})</h1>
      {submissions.length === 0 ? (
        <p style={{color:'#888'}}>Keine Bewerbungen gefunden</p>
      ) : (
        <SubmissionsTable submissions={submissions} />
      )}
    </main>
  )
}
