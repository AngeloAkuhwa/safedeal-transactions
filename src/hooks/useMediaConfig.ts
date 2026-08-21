import { useEffect, useState } from "react";
import { FALLBACK_MEDIA_CONFIG, MediaConfig, parseMediaConfig } from "@/lib/media-rules";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

let cached: MediaConfig | null = null;
let inflight: Promise<MediaConfig> | null = null;

export async function fetchMediaConfig(): Promise<MediaConfig> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/media-config`);
      if (!res.ok) return FALLBACK_MEDIA_CONFIG;
      const json = await res.json();
      // The endpoint already returns a parsed MediaConfig; re-parsing keeps us
      // safe if it ever returns raw setting rows instead.
      cached = (json && typeof json.imageMinDimensionPx === "number")
        ? (json as MediaConfig)
        : parseMediaConfig(json);
      return cached;
    } catch {
      return FALLBACK_MEDIA_CONFIG;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Non-hook accessor for services. */
export const getMediaConfig = fetchMediaConfig;

/**
 * The single source of truth for seller-facing media thresholds.
 * Never hardcode limits in components. Read them from here so the numbers
 * shown to a seller always match what the server will enforce.
 */
export function useMediaConfig(): { config: MediaConfig; loading: boolean } {
  const [state, setState] = useState<{ config: MediaConfig; loading: boolean }>(() => ({
    config: cached ?? FALLBACK_MEDIA_CONFIG,
    loading: !cached,
  }));

  useEffect(() => {
    if (cached) {
      setState({ config: cached, loading: false });
      return;
    }
    let cancelled = false;
    fetchMediaConfig().then((cfg) => {
      if (!cancelled) setState({ config: cfg, loading: false });
    });
    return () => { cancelled = true; };
  }, []);

  return state;
}