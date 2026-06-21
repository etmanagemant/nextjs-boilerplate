// utils/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Sicherheits-Check: Falls Vercel die Variablen noch nicht geladen hat, fangen wir den Fehler ab
  if (!url || !key) {
    throw new Error("Supabase Umgebungsvariablen fehlen im Server-Umfeld!");
  }

  return createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Kann in Server-Komponenten ignoriert werden
          }
        },
      },
    }
  )
}
