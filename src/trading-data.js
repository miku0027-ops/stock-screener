export async function getJSON(url, signal) {
  const r = await fetch(url, {
    cache: "no-store",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(8000)])
      : AbortSignal.timeout(8000),
  });
  if (!r.ok) {
    const e = new Error(
      r.status === 429 ? "Provider rate limited" : "Source unavailable",
    );
    e.status = r.status;
    throw e;
  }
  return r.json();
}
const hyperBase = "https://api.hyperliquid.xyz/info";
export async function hyperJSON(body, signal) {
  const r = await fetch(hyperBase, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(8000)])
      : AbortSignal.timeout(8000),
  });
  if (!r.ok) {
    const e = new Error(
      r.status === 429
        ? "Provider rate limited"
        : "Perpetual source unavailable",
    );
    e.status = r.status;
    throw e;
  }
  return r.json();
}
