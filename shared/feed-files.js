export const historyFile = (id, period) =>
  `history/${id.replace(/[^a-zA-Z0-9]/g, "_")}-${period}.json`;
export const snapshotFile = (period) => `snapshots/${period}.json`;
