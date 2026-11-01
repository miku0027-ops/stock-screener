import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetch, EnvHttpProxyAgent } from "undici";
const dir = path.resolve(process.argv[2] || "/tmp/atlas-market-data");
const initial = JSON.parse(
  await readFile(
    new URL("../data/announced-unlocks.json", import.meta.url),
    "utf8",
  ),
);
let data;
try {
  data = JSON.parse(
    await readFile(path.join(dir, "announced-unlocks.json"), "utf8"),
  );
} catch {
  data = initial;
}
if (Date.now() - Date.parse(data.checkedAt) > 86400000) {
  try {
    const r = await fetch("https://docs.starknet.io/learn/protocol/strk", {
      dispatcher: new EnvHttpProxyAgent(),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw Error("Issuer source unavailable");
    const text = (await r.text()).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    // Fail closed if the explicit published schedule no longer matches our reviewed source.
    const valid =
      /Up to 1\.27% \(127 million tokens\).*?15th of each month.*?April 15, 2025.*?March 15, 2027/.test(
        text,
      );
    const checkedAt = new Date().toISOString();
    data = {
      ...initial,
      checkedAt,
      events: valid ? initial.events.map((e) => ({ ...e, checkedAt })) : [],
      sourceVerified: valid,
    };
  } catch {
    data = {
      ...data,
      lastCheckError: "Issuer source could not be reverified",
      attemptedAt: new Date().toISOString(),
    };
  }
}
await mkdir(dir, { recursive: true });
await writeFile(
  path.join(dir, "announced-unlocks.json"),
  JSON.stringify(data) + "\n",
);
console.log("Announced unlock source records:", data.events.length);
