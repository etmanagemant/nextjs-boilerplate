import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import ContentPlanClient from "@/components/layout/ContentPlanClient";
// import ContentUploader from "@/components/layout/ContentUploader";
import {
  getModels,
  getContentCommunities,
  getContentPlanPosts,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function ContentPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ model?: string }>;
}) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // ========================================
    // ADMIN-ONLY CHECK
    // ========================================
    if (!user) {
      redirect("/login");
    }

    let isAdmin = false;
    if (
      user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" ||
      user.email === "etmanagement@gmail.com"
    ) {
      isAdmin = true;
    } else {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (profile && profile.role === "admin") isAdmin = true;
    }

    if (!isAdmin) {
      redirect("/");
    }

    // ========================================
    // DATA FETCHING
    // ========================================
    const params = await searchParams;
    const models = await getModels();
    const communities = await getContentCommunities();

    // Default to first model or use URL param
    const selectedModelId = params.model || (models.length > 0 ? models[0].id : "");
    const posts = selectedModelId ? await getContentPlanPosts(selectedModelId) : [];

    return (
      <main className="p-6 max-w-7xl mx-auto min-h-screen bg-[#0A0A0A] text-[#F3E5AB] rounded-xl my-6 border border-[#AA7C11]/20 shadow-2xl">
        {/* HEADER */}
        <div className="flex justify-between items-center mb-8 border-b border-[#AA7C11]/20 pb-6 flex-wrap gap-4 pt-4">
          <div>
            <h1 className="text-3xl font-black bg-gradient-to-r from-[#F3E5AB] to-[#D4AF37] bg-clip-text text-transparent uppercase tracking-wider">
              📅 Content-Plan
            </h1>
            <p className="text-xs text-slate-400 mt-2">
              Digitale Verwaltung deines Reddit-Content-Plans mit visuellem Explorer
            </p>
          </div>
          <form action="/api/logout" method="POST">
            <button
              type="submit"
              className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-4 py-2 rounded-lg hover:bg-red-500/20 transition cursor-pointer font-bold"
            >
              Abmelden
            </button>
          </form>
        </div>

        {/* MODEL SELECTOR */}
        <section className="bg-black/40 p-6 rounded-xl border border-[#AA7C11]/10 mb-8 shadow-lg">
          <label className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider block mb-3">
            Model auswählen:
          </label>
          <div className="flex flex-wrap gap-2">
            {models.length === 0 ? (
              <p className="text-xs text-slate-400">
                Keine Models vorhanden. Bitte füge Models im Management hinzu.
              </p>
            ) : (
              models.map((model) => (
                <a
                  key={model.id}
                  href={`/content-plan?model=${model.id}`}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition cursor-pointer ${
                    selectedModelId === model.id
                      ? "bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] text-black shadow-lg"
                      : "bg-[#050505] border border-[#AA7C11]/20 text-[#D4AF37] hover:border-[#D4AF37]"
                  }`}
                >
                  {model.name}
                </a>
              ))
            )}
          </div>
        </section>

        {/* UPLOAD SECTION - DISABLED */}
        {/* 
        {selectedModelId && (
          <ContentUploader
            modelId={selectedModelId}
            onUploadSuccess={() => {
              setTimeout(() => window.location.reload(), 2000);
            }}
          />
        )}
        */}

        {/* INFO SECTION */}
        {selectedModelId && (
          <section className="bg-black/40 border border-[#AA7C11]/10 p-4 rounded-xl mb-8 text-center shadow-lg">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              Posts für Model
            </div>
            <div className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-[#D4AF37] mt-2 font-mono tracking-wide">
              {posts.length} Einträge
            </div>
          </section>
        )}

        {/* CONTENT PLAN CLIENT COMPONENT */}
        {selectedModelId ? (
          <ContentPlanClient
            initialPosts={posts}
            communities={communities}
            models={models}
            selectedModelId={selectedModelId}
          />
        ) : (
          <div className="bg-black/40 p-12 rounded-xl border border-[#AA7C11]/10 text-center">
            <p className="text-slate-400">Bitte wähle ein Model aus der Liste oben.</p>
          </div>
        )}
      </main>
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("ContentPlan Error:", error);
    return (
      <main className="p-6 max-w-7xl mx-auto min-h-screen bg-[#0A0A0A] text-[#F3E5AB]">
        <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-xl">
          <h1 className="text-xl font-bold text-red-400 mb-2">❌ Fehler beim Laden</h1>
          <p className="text-red-400 text-sm mb-4">{errorMessage}</p>
          <details className="text-xs text-slate-400 mt-4 bg-black/40 p-3 rounded border border-red-500/10">
            <summary className="cursor-pointer font-bold">Vollständiger Error</summary>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap">{JSON.stringify(error, null, 2)}</pre>
          </details>
          <a href="/" className="inline-block bg-[#D4AF37] text-black px-4 py-2 rounded font-bold hover:bg-[#E5C158] mt-4">
            Zur Startseite
          </a>
        </div>
      </main>
    );
  }
}
