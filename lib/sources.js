// Raw text sources: one "ip:port" per line. Add/remove freely.

export const SOURCES = [
  {
    url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt",
    protocol: "http",
  },
  {
    url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks4.txt",
    protocol: "socks4",
  },
  {
    url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt",
    protocol: "socks5",
  },

  {
    url: "https://cdn.jsdelivr.net/gh/officialputuid/ProxyForEveryone@main/http/http.txt",
    protocol: "http",
  },
  {
    url: "https://cdn.jsdelivr.net/gh/officialputuid/ProxyForEveryone@main/socks4/socks4.txt",
    protocol: "socks4",
  },
  {
    url: "https://cdn.jsdelivr.net/gh/officialputuid/ProxyForEveryone@main/socks5/socks5.txt",
    protocol: "socks5",
  },

  {
    url: "https://raw.githubusercontent.com/komutan234/Proxy-List-Free/main/proxies/http.txt",
    protocol: "http",
  },
  {
    url: "https://raw.githubusercontent.com/komutan234/Proxy-List-Free/main/proxies/socks4.txt",
    protocol: "socks4",
  },
  {
    url: "https://raw.githubusercontent.com/komutan234/Proxy-List-Free/main/proxies/socks5.txt",
    protocol: "socks5",
  },

  {
    url: "https://raw.githubusercontent.com/proxygenerator1/ProxyGenerator/main/MostStable/http.txt",
    protocol: "http",
  },
  {
    url: "https://raw.githubusercontent.com/proxygenerator1/ProxyGenerator/main/MostStable/socks4.txt",
    protocol: "socks4",
  },
  {
    url: "https://raw.githubusercontent.com/proxygenerator1/ProxyGenerator/main/MostStable/socks5.txt",
    protocol: "socks5",
  },

  {
    url: "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/http/data.txt",
    protocol: "http",
  },
  {
    url: "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/socks4/data.txt",
    protocol: "socks4",
  },
  {
    url: "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/socks5/data.txt",
    protocol: "socks5",
  },

  {
    url: "https://raw.githubusercontent.com/VPSLabCloud/VPSLab-Free-Proxy-List/main/http_all.txt",
    protocol: "http",
  },
  {
    url: "https://raw.githubusercontent.com/VPSLabCloud/VPSLab-Free-Proxy-List/main/socks4_all.txt",
    protocol: "socks4",
  },
  {
    url: "https://raw.githubusercontent.com/VPSLabCloud/VPSLab-Free-Proxy-List/main/socks5_all.txt",
    protocol: "socks5",
  },

  {
    url: "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt",
    protocol: "http",
  },
  {
    url: "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/socks4.txt",
    protocol: "socks4",
  },
  {
    url: "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/socks5.txt",
    protocol: "socks5",
  },

  {
    url: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt",
    protocol: "http",
  },
  {
    url: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS4_RAW.txt",
    protocol: "socks4",
  },
  {
    url: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS5_RAW.txt",
    protocol: "socks5",
  },

  {
    url: "https://raw.githubusercontent.com/MuRongPIG/Proxy-Master/main/http.txt",
    protocol: "http",
  },
  {
    url: "https://raw.githubusercontent.com/MuRongPIG/Proxy-Master/main/socks4.txt",
    protocol: "socks4",
  },
  {
    url: "https://raw.githubusercontent.com/MuRongPIG/Proxy-Master/main/socks5.txt",
    protocol: "socks5",
  },
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
    }),
  );

  const map = new Map(); // dedupe by "protocol|ip:port"
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const c of r.value) map.set(`${c.protocol}|${c.addr}`, c);
  }
  return [...map.values()];
}
