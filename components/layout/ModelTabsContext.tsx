"use client";

import { createContext, useContext, useEffect, useState } from "react";

export interface ModelTabsContextModel {
  id: string;
  name: string;
  avatar_url?: string | null;
}

interface ModelTabsContextValue {
  models: ModelTabsContextModel[];
  activeModelId: string | null;
  chatterId: string;
  // Which page's tabs these are - OF Inbox (Beta) reuses this same
  // context/bar as /crm-inbox, just needs its links to point at itself.
  basePath?: string;
}

// Split into two contexts on purpose - CONFIRMED LIVE this caused an
// infinite render loop when they were combined into one { value, setValue }
// object memoized on [value]: every setValue() call changes value, which
// recomputes that combined object, which is a NEW reference passed down as
// the context value, which re-triggers usePublishModelTabs's effect
// (depends on the combined object) since ITS identity just changed, which
// calls setValue() again, forever - froze the entire tab the moment
// CRMInboxClient mounted and started publishing. Keeping the setter in its
// own context sidesteps this: React's setState dispatch function is
// guaranteed referentially stable across renders, so SetterContext's
// value never changes and effects depending on it never spuriously re-fire.
const ValueContext = createContext<ModelTabsContextValue | null>(null);
const SetterContext = createContext<((v: ModelTabsContextValue | null) => void) | null>(null);

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
  return (
    <SetterContext.Provider value={setValue}>
      <ValueContext.Provider value={value}>{children}</ValueContext.Provider>
    </SetterContext.Provider>
  );
}

// Consumed by GlobalTopBar to know what (if anything) to render in the
// header's middle section.
export function useModelTabsDisplay(): ModelTabsContextValue | null {
  return useContext(ValueContext);
}

// Called by CRMInboxClient (the only current publisher) - publishes on
// mount/update, clears back to null on unmount so any OTHER page's header
// goes back to empty the moment you navigate away from crm-inbox.
export function usePublishModelTabs(
  models: ModelTabsContextModel[],
  activeModelId: string | null,
  chatterId: string,
  basePath?: string
) {
  const setValue = useContext(SetterContext);
  useEffect(() => {
    if (!setValue) return;
    setValue({ models, activeModelId, chatterId, basePath });
    return () => setValue(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setValue, JSON.stringify(models), activeModelId, chatterId, basePath]);
}
