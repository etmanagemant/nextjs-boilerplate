"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export interface ModelTabsContextModel {
  id: string;
  name: string;
  avatar_url?: string | null;
}

interface ModelTabsContextValue {
  models: ModelTabsContextModel[];
  activeModelId: string | null;
  chatterId: string;
}

const ModelTabsContext = createContext<{
  value: ModelTabsContextValue | null;
  setValue: (v: ModelTabsContextValue | null) => void;
} | null>(null);

/**
 * Bridges the CRM Inbox page's model-tab data up into GlobalTopBar, which
 * renders in the root layout (a sibling of the page tree, not an ancestor
 * of CRMInboxClient) - so it has no other way to know which models/active
 * model to show in the header. Only ever holds ONE publisher's data at a
 * time (only the CRM Inbox page publishes), so a plain nullable value is
 * enough - no need for a keyed registry.
 */
export function ModelTabsProvider({ children }: { children: React.ReactNode }) {
  const [value, setValue] = useState<ModelTabsContextValue | null>(null);
  const ctx = useMemo(() => ({ value, setValue }), [value]);
  return <ModelTabsContext.Provider value={ctx}>{children}</ModelTabsContext.Provider>;
}

// Consumed by GlobalTopBar to know what (if anything) to render in the
// header's middle section.
export function useModelTabsDisplay(): ModelTabsContextValue | null {
  const ctx = useContext(ModelTabsContext);
  return ctx ? ctx.value : null;
}

// Called by CRMInboxClient (the only current publisher) - publishes on
// mount/update, clears back to null on unmount so any OTHER page's header
// goes back to empty the moment you navigate away from crm-inbox.
export function usePublishModelTabs(
  models: ModelTabsContextModel[],
  activeModelId: string | null,
  chatterId: string
) {
  const ctx = useContext(ModelTabsContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.setValue({ models, activeModelId, chatterId });
    return () => ctx.setValue(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, JSON.stringify(models), activeModelId, chatterId]);
}
