// proxy.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set({ name, value, ...options }))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    }
  )

  // 1. Aktuellen Supabase-User abfragen
  const { data: { user } } = await supabase.auth.getUser()
  const url = request.nextUrl.clone()

  // 2. Erlaubte Pfade ohne Login (Damit man sich nicht im Kreis leitet!)
  const isLoginPath = url.pathname === '/login'

  if (!user) {
    // Wenn NICHT eingeloggt und nicht auf der Login-Seite -> Ab zum Login!
    if (!isLoginPath) {
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  // 3. Wenn eingeloggt, Rolle aus der 'mitarbeiter' Tabelle holen
  const { data: mitarbeiter } = await supabase
    .from('mitarbeiter')
    .select('rolle')
    .eq('email', user.email!)
    .maybeSingle()

  const role = mitarbeiter?.rolle || 'chatter'

  // 4. Automatisches Rollen-Routing
  // Wenn der Nutzer die nackte URL "/" aufruft, schicken wir ihn auf seine Arbeitsseite
  if (url.pathname === '/') {
    if (role === 'admin') {
      url.pathname = '/management'
    } else {
      url.pathname = '/chatter'
    }
    return NextResponse.redirect(url)
  }

  // 5. Schutz der Admin-Seite vor normalen Chattern
  if (url.pathname.startsWith('/management') && role !== 'admin') {
    url.pathname = '/chatter'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Betrifft das gesamte Projekt außer statische System-Dateien
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
