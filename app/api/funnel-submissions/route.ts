import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export async function POST(req: Request) {
  try {
    const secret = process.env.MAIN_APP_INCOMING_SECRET
    const header = req.headers.get('x-funnel-secret')
    if (secret && header !== secret) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    
    // Save to Supabase
    if (supabaseUrl && supabaseAnonKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseAnonKey)
        const { data, error } = await supabase
          .from('funnel_submissions')
          .insert([
            {
              name: body.name,
              email: body.email,
              birthday: body.birthday,
              phone: body.phone,
              'contactMethod': body.contactMethod,
              category: body.category,
              social: body.social,
              'showFace': body.showFace,
              message: body.message,
              experience: body.experience,
              start: body.start,
              variant: body.variant,
              utm: body.utm,
              'receivedAt': new Date().toISOString(),
            }
          ])

        if (error) {
          console.error('Supabase insert error:', error)
        } else {
          console.log('Submission saved to Supabase:', data)
        }
      } catch (supabaseErr) {
        console.error('Supabase save failed:', supabaseErr instanceof Error ? supabaseErr.message : String(supabaseErr))
      }
    } else {
      console.warn('Supabase credentials not configured')
    }
    
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('funnel webhook error', err)
    return NextResponse.json({ error: 'server error' }, { status: 500 })
  }
}
