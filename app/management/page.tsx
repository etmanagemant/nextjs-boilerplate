export default function ManagementPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Management (Mock)</h1>
      <p style={{ color: "#444" }}>
        Hier kommt später deine Creator-/Task-Ansicht (Offen / In Arbeit / Geplant) rein.
      </p>

      <section style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 10px 0" }}>Status-Tabs</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button>Offen</button>
          <button>In Arbeit</button>
          <button>Geplant</button>
        </div>
      </section>
    </main>
  );
}