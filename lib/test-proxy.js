import fetch from "node-fetch";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";

const TEST_URL = "https://api.ipify.org?format=json";
const TIMEOUT_MS = 5000;

function buildAgent(protocol, addr) {
  if (protocol === "http") return new HttpsProxyAgent(`http://${addr}`);
  return new SocksProxyAgent(`${protocol}://${addr}`); // socks4 / socks5
}

// Returns true if the proxy is alive (able to fetch TEST_URL within TIMEOUT_MS).
export async function isAlive({ addr, protocol }) {
  try {
    const agent = buildAgent(protocol, addr);
    const res = await fetch(TEST_URL, {
      agent,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Test a batch of candidates with bounded concurrency.
export async function testBatch(candidates, concurrency = 200) {
  const alive = [];
  const dead = [];
  let i = 0;

  async function worker() {
    while (i < candidates.length) {
      const idx = i++;
      const c = candidates[idx];
      const ok = await isAlive(c);
      (ok ? alive : dead).push(c);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, candidates.length) }, worker)
  );

  return { alive, dead };
}
