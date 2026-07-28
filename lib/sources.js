// Raw text sources: one "ip:port" per line. Add/remove freely.

export const SOURCES = [
  { url: "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/http/data.txt", protocol: "http" },
  { url: "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/socks4/data.txt", protocol: "socks4" },
  { url: "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/socks5/data.txt", protocol: "socks5" },

  { url: "https://raw.githubusercontent.com/proxyscrape/free-proxy-list/main/http.txt", protocol: "http" },
  { url: "https://raw.githubusercontent.com/proxyscrape/free-proxy-list/main/socks4.txt", protocol: "socks4" },
  { url: "https://raw.githubusercontent.com/proxyscrape/free-proxy-list/main/socks5.txt", protocol: "socks5" },

  { url: "https://raw.githubusercontent.com/databay-labs/free-proxy-list/master/http.txt", protocol: "http" },
  { url: "https://raw.githubusercontent.com/databay-labs/free-proxy-list/master/socks4.txt", protocol: "socks4" },
  { url: "https://raw.githubusercontent.com/databay-labs/free-proxy-list/master/socks5.txt", protocol: "socks5" },

  { url: "https://raw.githubusercontent.com/dpangestuw/Free-Proxy/main/http_proxies.txt", protocol: "http" },
  { url: "https://raw.githubusercontent.com/dpangestuw/Free-Proxy/main/socks4_proxies.txt", protocol: "socks4" },
  { url: "https://raw.githubusercontent.com/dpangestuw/Free-Proxy/main/socks5_proxies.txt", protocol: "socks5" },

  { url: "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/data/http.txt", protocol: "http" },
  { url: "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/data/socks4.txt", protocol: "socks4" },
  { url: "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/data/socks5.txt", protocol: "socks5" },

  { url: "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt", protocol: "http" },
  { url: "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks4.txt", protocol: "socks4" },
  { url: "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt", protocol: "socks5" },

  { url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt", protocol: "http" },
  { url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks4.txt", protocol: "socks4" },
  { url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt", protocol: "socks5" },
];

const LINE_RE = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d{2,5})$/;

export async function fetchAllCandidates() {
  const results = await Promise.allSettled(
    SOURCES.map(async (src) => {
      const res = await fetch(src.url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return [];
      const text = await res.text();
      return text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => LINE_RE.test(l))
        .map((l) => ({ addr: l, protocol: src.protocol }));
    })
  );

  const map = new Map(); // dedupe by "protocol|ip:port"
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const c of r.value) map.set(`${c.protocol}|${c.addr}`, c);
  }
  return [...map.values()];
}
