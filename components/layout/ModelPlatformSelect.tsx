"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function ModelPlatformSelect({ modelId, defaultPlatform }: { modelId: string | number; defaultPlatform: string }) {
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
    stripchat: "bg-[#9C7A3D]/20 border-[#9C7A3D]/40 text-[#C9A86A]",
    both: "bg-[#E5C158]/20 border-[#E5C158]/40 text-[#E5C158]"
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
