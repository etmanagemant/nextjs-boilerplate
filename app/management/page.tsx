import { getCurrentRole } from "@/lib/authz";

export default async function ManagementPage() {
  const role = await getCurrentRole();

  if (!role) {
    return new Response(null, {
      status: 307,
      headers: { Location: "/login?next=/management" },
    });
  }

  if (role !== "admin") {
    return new Response(null, {
      status: 307,
      headers: { Location: "/" },
    });
  }

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-4">Management</h1>
      <p className="text-gray-700 mb-4">
        Hier kommt später deine Creator-/Task-Ansicht (Offen / In Arbeit / Geplant) rein.
      </p>

      <section className="mt-6">
        <h2 className="text-lg font-semibold mb-2">Status-Tabs</h2>
        <div className="flex gap-2 flex-wrap">
          <button className="px-4 py-2 border rounded">Offen</button>
          <button className="px-4 py-2 border rounded">In Arbeit</button>
          <button className="px-4 py-2 border rounded">Geplant</button>
        </div>
      </section>
    </main>
  );
}
