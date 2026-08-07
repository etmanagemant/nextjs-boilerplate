/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Bugfix (gemeldet 2026-08-07): pdfkit crashte mit HTTP 500 in Produktion,
  // obwohl es lokal (pures node, kein Bundler) einwandfrei lief - Next.js
  // bundelt Server-Route-Dependencies standardmaessig durch Webpack, das
  // pdfkits eigene fs.readFileSync-Aufrufe auf seine .afm-Font-Datendateien
  // zerstoert. pdfkit steht (anders als z.B. @react-pdf/renderer) NICHT auf
  // Next.js' eigener automatischer Ausnahmeliste - muss explizit als
  // natives Node-require statt gebuendelt laufen.
  serverExternalPackages: ["pdfkit"],
  // Zusaetzliche Absicherung fuer denselben Bug: garantiert, dass pdfkits
  // eigene Font-Datendateien (.afm) im deployten Funktions-Paket landen,
  // falls Next.js' automatische Datei-Erkennung sie sonst uebersieht.
  outputFileTracingIncludes: {
    "/api/buchhaltung/abrechnung-pdf": ["./node_modules/pdfkit/**/*"],
    "/api/abrechnung/rechnung-pdf": ["./node_modules/pdfkit/**/*"],
  },
};

export default nextConfig;
