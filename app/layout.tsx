// app/layout.tsx
import "./globals.css";

export const metadata = {
  title: "ET Management",
  description: "Agency dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" className="dark">
      <body className="min-h-screen bg-bg-base text-text-primary antialiased bg-brand-glow">
        <header className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center px-6 border-b border-line-subtle bg-bg-base/70 backdrop-blur">
  <div className="flex items-center gap-4">
    <img
      src="/images/logo.png"
      alt="ET Management"
      className="h-10 w-auto block"
    />

    <nav className="flex items-center gap-3">
      <a
        href="/"
        className="rounded-lg bg-brand-goldBg px-4 py-2 text-sm font-semibold text-bg-base shadow-goldSoft transition hover:bg-brand-goldBgDeep focus:outline-none focus:ring-2 focus:ring-brand-goldBorder"
      >
        Start
      </a>

      <a
        href="/management"
        className="rounded-lg bg-brand-goldBg px-4 py-2 text-sm font-semibold text-bg-base shadow-goldSoft transition hover:bg-brand-goldBgDeep focus:outline-none focus:ring-2 focus:ring-brand-goldBorder"
      >
        Management
      </a>

      <a
        href="/chatter"
        className="rounded-lg bg-brand-goldBg px-4 py-2 text-sm font-semibold text-bg-base shadow-goldSoft transition hover:bg-brand-goldBgDeep focus:outline-none focus:ring-2 focus:ring-brand-goldBorder"
      >
        Chatter
      </a>
    </nav>
  </div>
</header>

        <main className="pt-16">{children}</main>
      </body>
    </html>
  );
}