import fs from "node:fs";
import path from "node:path";

// Dead proxies are never stored in Redis. They live as an append-only text
// log committed to the repo itself, one "protocol|ip:port" per line.
// This file is only ever read/written by the GitHub Action runner
// (scripts/refresh.mjs), which has a real git checkout it can commit back to.

export const DEAD_LOG_PATH = path.resolve(
  process.cwd(),
  "data/dead-proxies.txt"
);

export function loadDeadSet(filePath = DEAD_LOG_PATH) {
  if (!fs.existsSync(filePath)) return new Set();
  const text = fs.readFileSync(filePath, "utf8");
  const set = new Set();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) set.add(trimmed);
  }
  return set;
}

// Appends only. Caller is expected to have already filtered out entries
// that are already in the loaded dead set, so no in-file dedupe is done here.
export function appendDead(entries, filePath = DEAD_LOG_PATH) {
  if (!entries.length) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = entries.map((key) => `${key}\n`).join("");
  fs.appendFileSync(filePath, lines, "utf8");
}
