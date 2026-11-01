export function declaredUnlocks(events, now = Date.now()) {
  const today = new Date(now).toISOString().slice(0, 10);
  return events
    .filter((e) => {
      if (
        e.status !== "announced" ||
        !e.symbol ||
        !/^\d{4}-\d{2}-\d{2}$/.test(e.date) ||
        e.date < today
      )
        return false;
      const day = Date.parse(e.date + "T00:00:00Z");
      if (
        !Number.isFinite(day) ||
        new Date(day).toISOString().slice(0, 10) !== e.date
      )
        return false;
      const verified = Date.parse(e.checkedAt);
      if (
        !Number.isFinite(verified) ||
        verified > now + 86400000 ||
        now - verified > 35 * 86400000
      )
        return false;
      try {
        const u = new URL(e.source);
        return (
          u.protocol === "https:" &&
          u.hostname === "docs.starknet.io" &&
          e.symbol === "STRK" &&
          Number.isFinite(e.amount) &&
          e.amount > 0
        );
      } catch {
        return false;
      }
    })
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol),
    );
}
