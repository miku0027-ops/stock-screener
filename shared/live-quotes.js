export function normalizeTicker(row, now = Date.now()) {
  const stream = row.e === "24hrMiniTicker",
    id = stream ? row.s : row.symbol,
    price = Number(stream ? row.c : row.lastPrice),
    open = Number(stream ? row.o : row.openPrice),
    asOf = Number(stream ? row.E : row.closeTime),
    volume = Number(stream ? row.q : row.quoteVolume),
    high = Number(stream ? row.h : row.highPrice),
    low = Number(stream ? row.l : row.lowPrice);
  if (
    !/^[A-Z0-9]{2,20}USDT$/.test(id || "") ||
    ![price, open, asOf, volume].every(Number.isFinite) ||
    price <= 0 ||
    open <= 0 ||
    volume < 0 ||
    asOf > now + 1000 ||
    (stream && now - asOf > 120000) ||
    asOf <= 0
  )
    return null;
  return {
    id,
    symbol: id.slice(0, -4),
    price,
    open,
    change: (price / open - 1) * 100,
    volume,
    asOf,
    high: Number.isFinite(high) ? high : null,
    low: Number.isFinite(low) ? low : null,
  };
}
export function mergeTicker(previous, incoming, receivedAt = Date.now()) {
  if (!incoming || (previous && incoming.asOf <= previous.asOf))
    return previous;
  const moved = previous && incoming.price !== previous.price;
  return {
    ...previous,
    ...incoming,
    receivedAt,
    tickChange: previous ? (incoming.price / previous.price - 1) * 100 : null,
    tickInterval: previous ? incoming.asOf - previous.asOf : null,
    flash: moved ? (incoming.price > previous.price ? "up" : "down") : null,
    flashAt: moved ? receivedAt : 0,
  };
}
