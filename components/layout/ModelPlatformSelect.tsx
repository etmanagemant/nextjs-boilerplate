"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function ModelPlatformSelect({ modelId, defaultPlatform }: { modelId: number; defaultPlatform: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [platform, setPlatform] = useState(defaultPlatform || "onlyfans");
  const [updating, setUpdating] = useState(false);

  async function handlePlatformChange(newPlatform: string) {
    setPlatform(newPlatform);
    setUpdating(true);
    
    try {
      const { error } = await supabase
        .from("models")
        .update({ platform_type: newPlatform })
        .eq("id", modelId);

      if (!error) {
        router.refresh();
      }
    } catch (e) {
      console.error("Fehler beim Aktualisieren:", e);
    } finally {
      setUpdating(false);
    }
  }

  const platformLabels: Record<string, string> = {
    onlyfans: "🔴 OnlyFans",
    stripchat: "🎭 Stripchat",
    both: "🌐 Beide"
  };

  const platformColors: Record<string, string> = {
    onlyfans: "bg-orange-600/20 border-orange-500/40 text-orange-300",
    stripchat: "bg-purple-600/20 border-purple-500/40 text-purple-300",
    both: "bg-blue-600/20 border-blue-500/40 text-blue-300"
  };

  return (
    <select
      value={platform}
      onChange={(e) => handlePlatformChange(e.target.value)}
      disabled={updating}
      className={`text-xs px-2 py-1 rounded border outline-none cursor-pointer transition ${
        platformColors[platform] || platformColors.onlyfans
      } ${updating ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <option value="onlyfans">🔴 OnlyFans</option>
      <option value="stripchat">🎭 Stripchat</option>
      <option value="both">🌐 Beide</option>
    </select>
  );
}
