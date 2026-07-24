export default function ComingSoon({
  icon,
  title,
  subtitle,
}: {
  icon: string;
  title: string;
  subtitle: string;
}) {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center max-w-lg">
        <div className="text-6xl mb-6">{icon}</div>
        <h1 className="text-3xl font-black uppercase tracking-wider bg-gradient-to-r from-[#E2C48A] to-[#C9A86A] bg-clip-text text-transparent mb-4">
          {title}
        </h1>
        <p className="text-sm text-slate-400 mb-6">{subtitle}</p>
        <span className="inline-block px-4 py-2 rounded-lg bg-[#C9A86A]/10 border border-[#C9A86A]/30 text-[#C9A86A] text-xs font-bold uppercase tracking-widest">
          Coming Soon
        </span>
      </div>
    </main>
  );
}
