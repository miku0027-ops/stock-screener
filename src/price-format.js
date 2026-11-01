// Preserve useful quote precision for sub-dollar and low-priced instruments.
export function pricePrecision(value) {
  const magnitude = Math.abs(value);
  if (!Number.isFinite(magnitude) || magnitude === 0) return 2;
  return Math.min(12, Math.max(2, 6 - Math.floor(Math.log10(magnitude))));
}
export function priceLabel(value) {
  return Number.isFinite(value)
    ? value.toLocaleString("en-US", {
        minimumFractionDigits: Math.abs(value) >= 1 ? 2 : 0,
        maximumFractionDigits: pricePrecision(value),
      })
    : "—";
}
