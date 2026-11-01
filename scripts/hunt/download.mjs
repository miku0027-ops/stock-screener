import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fetch, EnvHttpProxyAgent } from "undici";
const root = path.resolve(process.argv[2] || "/tmp/sharpnex-history"),
  dispatcher = new EnvHttpProxyAgent(),
  base = "https://data.binance.vision/data";
await mkdir(root, { recursive: true });
const jobs = [];
for (const venue of ["spot", "futures/um"])
  for (const symbol of ["BTCUSDT", "ETHUSDT"])
    for (let year = 2023; year <= 2026; year++)
      for (let month = 1; month <= (year === 2026 ? 9 : 12); month++) {
        const date = `${year}-${String(month).padStart(2, "0")}`,
          name = `${symbol}-1m-${date}.zip`,
          url = `${base}/${venue}/monthly/klines/${symbol}/1m/${name}`;
        jobs.push({
          venue,
          symbol,
          date,
          url,
          file: path.join(root, venue.replace("/", "-"), name),
        });
      }
let cursor = 0,
  completed = 0;
const manifest = [];
async function get(url) {
  const r = await fetch(url, {
    dispatcher,
    signal: AbortSignal.timeout(120000),
  });
  if (!r.ok) throw Error(`HTTP ${r.status} ${url}`);
  return r;
}
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      try {
        await mkdir(path.dirname(job.file), { recursive: true });
        let expected;
        try {
          expected = (await readFile(job.file + ".CHECKSUM", "utf8"))
            .trim()
            .split(/\s+/)[0];
        } catch {
          expected = (await (await get(job.url + ".CHECKSUM")).text())
            .trim()
            .split(/\s+/)[0];
        }
        if (!/^[a-fA-F0-9]{64}$/.test(expected))
          throw Error("Invalid checksum");
        let bytes;
        try {
          bytes = await readFile(job.file);
        } catch {
          bytes = Buffer.from(await (await get(job.url)).arrayBuffer());
        }
        const actual = createHash("sha256").update(bytes).digest("hex");
        if (actual.toLowerCase() !== expected.toLowerCase())
          throw Error("Archive checksum mismatch");
        await writeFile(job.file, bytes);
        await writeFile(job.file + ".CHECKSUM", expected + "\n");
        manifest.push({
          ...job,
          sha256: actual,
          bytes: bytes.length,
          status: "verified",
        });
      } catch (e) {
        manifest.push({ ...job, status: "failed", error: e.message });
      }
      completed++;
      if (completed % 12 === 0 || completed === jobs.length)
        console.log(
          `Archive verification ${completed}/${jobs.length}; failures ${manifest.filter((v) => v.status === "failed").length}`,
        );
    }
  }),
);
await writeFile(
  path.join(root, "manifest.json"),
  JSON.stringify(
    {
      createdAt: Date.now(),
      from: "2023-01",
      through: "2026-09",
      archives: manifest.sort((a, b) => a.file.localeCompare(b.file)),
    },
    null,
    2,
  ),
);
const failed = manifest.filter((v) => v.status === "failed");
if (failed.length) {
  console.error(failed.slice(0, 10));
  process.exitCode = 1;
}
