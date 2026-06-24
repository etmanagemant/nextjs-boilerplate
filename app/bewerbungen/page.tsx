import fs from 'fs'
import path from 'path'

export default async function Bewerbungen() {
  const dir = path.join(process.cwd(), 'funnel-submissions')
  let files = []
  try { files = fs.readdirSync(dir) } catch (e) { files = [] }
  const submissions = files.map(f => {
    const raw = fs.readFileSync(path.join(dir,f),'utf8')
    const obj = JSON.parse(raw)
    return { file: f, ...obj }
  }).sort((a,b)=> (b.receivedAt||b.timestamp||0) - (a.receivedAt||a.timestamp||0))

  return (
    <main style={{padding:24}}>
      <h1 style={{marginTop:0}}>Bewerbungen</h1>
      <ul>
        {submissions.map(s => (
          <li key={s.file} style={{padding:12,borderBottom:'1px solid #222'}}>
            <div style={{fontWeight:700}}>{s.name} <span style={{fontWeight:400}}>&lt;{s.email}&gt;</span></div>
            <div style={{fontSize:13,color:'#888'}}>{s.variant || ''} — {new Date(s.receivedAt||s.timestamp||0).toLocaleString()}</div>
            <pre style={{whiteSpace:'pre-wrap',marginTop:8}}>{JSON.stringify(s, null, 2)}</pre>
          </li>
        ))}
      </ul>
    </main>
  )
}
