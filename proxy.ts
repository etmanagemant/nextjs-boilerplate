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
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set({ name, value, ...options }))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const url = request.nextUrl.clone()
  const isLoginPath = url.pathname === '/login'

  // 1. Login-Zwang: Unangemeldete User müssen zum Login
  if (!user) {
    if (!isLoginPath) {
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  // 2. Rollen-Abfrage für angemeldete User
  const { data: mitarbeiter } = await supabase
    .from('mitarbeiter')
    .select('rolle')
    .eq('email', user.email!)
    .maybeSingle()

  const role = mitarbeiter?.rolle || 'chatter'

  // 3. Automatisches Weiterleiten je nach Rolle bei Aufruf von "/"
  if (url.pathname === '/') {
    if (role === 'admin') {
      url.pathname = '/management'
    } else {
      url.pathname = '/chatter'
    }
    return NextResponse.redirect(url)
  }

  // 4. Schutz: Chatter dürfen nicht auf die Management-Seite
  if (url.pathname.startsWith('/management') && role !== 'admin') {
    url.pathname = '/chatter'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
