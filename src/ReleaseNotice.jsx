import React, { useEffect, useState } from "react";
export default function ReleaseNotice() {
  const [next, setNext] = useState(null);
  useEffect(() => {
    let dead = false;
    const c = new AbortController();
    async function check() {
      if (document.hidden) return;
      try {
        const r = await fetch(
          `${import.meta.env.BASE_URL}version.json?t=${Math.floor(Date.now() / 60000)}`,
          { cache: "no-store", signal: c.signal },
        );
        if (r.ok) {
          const v = await r.json();
          if (
            !dead &&
            /^[a-f0-9]{7,40}$/.test(v.revision) &&
            v.revision !== __APP_REVISION__
          )
            setNext(v.revision);
        }
      } catch {}
    }
    check();
    const timer = setInterval(check, 60000);
    document.addEventListener("visibilitychange", check);
    return () => {
      dead = true;
      c.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return next ? (
    <button
      className="release-notice"
      onClick={() => {
        const url = new URL(location.href);
        url.searchParams.set("v", next);
        location.assign(url.href);
      }}
    >
      Update available · Reload
    </button>
  ) : null;
}
