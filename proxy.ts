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

  // 1. Wenn nicht eingeloggt -> Login-Zwang
  if (!user) {
    if (!isLoginPath) {
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  // 2. Rollen-Ermittlung
  let role = 'chatter'

  // Dein unverrückbarer Admin-Hardcode (Trage hier deine E-Mail oder UUID ein)
  if (user.email === 'tobias@beispiel.de' || user.id === '35498c92-2c4d-4720-a6f7-cc187a4c5fc4') {
    role = 'admin'
  } else {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()
      
    if (profile?.role) {
      role = profile.role
    }
  }

  // 3. Wenn der User die nackte URL "/" aufruft, leiten wir ihn auf seine Standard-Arbeitsseite
  if (url.pathname === '/') {
    if (role === 'admin') {
      url.pathname = '/management'
    } else {
      url.pathname = '/chatter'
    }
    return NextResponse.redirect(url)
  }

  // 4. Schutz: NUR Chatter fliegen von der Management-Seite. Admins dürfen ÜBERALL hin!
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
