export type TrafficPayload = {
  requestId: string; referrer: string; landing: string;
  utm_source?: string; utm_medium?: string; utm_campaign?: string;
  google_ads_click: boolean;
};

export function trafficPayload(url: string, referrer: string, requestId: string): TrafficPayload {
  const parsed = new URL(url);
  return {
    requestId, referrer, landing: parsed.pathname,
    utm_source: parsed.searchParams.get("utm_source") || undefined,
    utm_medium: parsed.searchParams.get("utm_medium") || undefined,
    utm_campaign: parsed.searchParams.get("utm_campaign") || undefined,
    // Retain only the presence, never the advertising identifier itself.
    google_ads_click: ["gclid", "gbraid", "wbraid"].some(key => !!parsed.searchParams.get(key)),
  };
}

export async function sendTraffic(payload: TrafficPayload, send = fetch): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3_000);
    try {
      const response = await send("/api/traffic", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload), keepalive: true, signal: controller.signal,
      });
      if (response.ok) return true;
      if (response.status < 500) return false;
    } catch { /* Retry the same request ID; the server deduplicates it. */ }
    finally { clearTimeout(timer); }
  }
  return false;
}
