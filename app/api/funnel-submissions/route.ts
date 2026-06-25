import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function POST(req: Request) {
  try {
    const secret = process.env.MAIN_APP_INCOMING_SECRET
    const header = req.headers.get('x-funnel-secret')
    if (secret && header !== secret) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    
    // Try to save to filesystem (works in development, fails on Vercel with read-only FS)
    try {
      const outDir = path.join(process.cwd(), 'funnel-submissions')
      fs.mkdirSync(outDir, { recursive: true })
      const filename = path.join(outDir, `${Date.now()}-${(body.email||'anon').replace(/[^a-z0-9]/gi,'_')}.json`)
      fs.writeFileSync(filename, JSON.stringify({ receivedAt: Date.now(), ...body }, null, 2))
    } catch (fsErr) {
      // Silently fail on Vercel (read-only filesystem)
      console.warn('Local filesystem save failed:', fsErr instanceof Error ? fsErr.message : String(fsErr))
    }
    
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('funnel webhook error', err)
    return NextResponse.json({ error: 'server error' }, { status: 500 })
  }
}
