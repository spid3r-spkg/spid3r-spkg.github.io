# `nettools` — Spid3r Cross-Platform Network Diagnostics Toolkit & CLI

`nettools` (`0.1.2`) is an Ed25519-signed Spid3r package that works both:
- as an **importable `spkg` library** (`import "nettools/lib" as nt;`), and
- as an **installable global CLI tool** via `spkg tool install nettools` (`nettools` and `nettools-server`).

It provides validated network diagnostics, deterministic IPv4/CIDR/range math, DNS-over-HTTPS (Cloudflare + Google DoH fallback), RDAP/WHOIS lookups (with HTTPS redirect following), HTTP/TLS inspection, and cross-platform Windows / Linux / macOS CLI execution with an optional loopback-only companion server.

---

## Installation

### A) Global CLI Command (`spkg tool`)

Install `nettools` and `nettools-server` globally into your Spid3r tool bin directory (for example `%LOCALAPPDATA%\Spid3r\bin` on Windows or `~/.local/share/spid3r/bin` on Linux/macOS):

```bash
spkg tool install nettools
spkg tool list
```

Update or uninstall later:

```bash
spkg tool install nettools --force
spkg tool uninstall nettools
```

### B) Project Library (`spkg install`)

```bash
spkg install nettools
# Or pin exact version:
spkg install nettools==0.1.2
```

Or declare in `spider.toml`:

```toml
[dependencies]
nettools = { version = "^0.1.2" }
```

Import in Spid3r (`.matrix`):

```matrix
import "nettools/lib" as nt;
```

---

## Global CLI Reference (`nettools`)

```text
nettools <command> [args...] [--json]
nettools-server
```

| Command | Arguments | What it does |
| :--- | :--- | :--- |
| `nettools subnet <cidr>` | e.g. `192.168.10.0/26` | Network, netmask, wildcard, broadcast, usable host range, class & scope |
| `nettools range <start> <end>` | e.g. `192.168.1.10 192.168.1.20` | Aggregate IPv4 range into minimal CIDR blocks |
| `nettools ip <ipv4>` / `classify` | e.g. `100.64.10.1` | IPv4 class, RFC scope, and routability |
| `nettools port <host> <port>` | e.g. `example.com 443` | TCP handshake connectivity & RTT check |
| `nettools tcpping <host> [port] [count]` | defaults: `443`, `4` | Sequential TCP ping probes (`min`/`avg`/`max` ms & loss %) |
| `nettools dns <host> [type]` | default type: `A` | DNS-over-HTTPS JSON query (Cloudflare + Google fallback) |
| `nettools http <url> [method]` | default method: `GET` | HTTP/HTTPS status, latency & body preview |
| `nettools whois <query>` / `rdap` | domain, IP, or `AS<num>` | RDAP registration lookup (follows `https://` redirects) |
| `nettools ping <host> [count]` | default count: `4` | Cross-platform OS ping |
| `nettools trace <host>` | host or IP | Cross-platform `traceroute` / `tracert` |
| `nettools nslookup` / `dig` | `<host> [type]` | OS DNS lookup (`A`/`AAAA`/`MX`/...) |
| `nettools ssl <host> [port]` | default port: `443` | OpenSSL `s_client` TLS inspection |
| `nettools ipconfig` / `ifconfig` / `hostname` / `arp` / `route` / `interfaces` / `netstat` / `connections` / `open_ports` / `net_stats` | none | OS interface, routing, ARP, and socket inspection |
| `nettools --version` / `--help` | optional `--json` | Version/OS banner or full CLI help |

Pass `--json` to any subcommand for structured JSON output.

---

## Library Usage Examples (`import "nettools/lib" as nt;`)

### 1. Subnet, CIDR & IP Range Calculations (Offline)

```matrix
import "nettools/lib" as nt;

fn main() {
    let sub = nt.subnet_calc("192.168.10.45/24").unwrap();
    println("Network:   " + sub["network"]);
    println("Netmask:   " + sub["netmask"]);
    println("Broadcast: " + sub["broadcast"]);
    println("Usable:    " + sub["first_host"] + " - " + sub["last_host"]);

    let rng = nt.ip_range_calc("192.168.1.0", "192.168.3.255").unwrap();
    println("CIDRs:     " + rng["cidrs"].join(", "));

    let cls = nt.classify_ipv4("100.64.10.1").unwrap();
    println("Scope:     " + cls["scope"] + " (" + cls["rfc"] + ")");
    return 0;
}
```

### 2. TCP Ping & Port Connectivity Check

```matrix
import "nettools/lib" as nt;

fn main() {
    let port_res = nt.check_port("example.com", 443).unwrap();
    println("Port 443 open=" + string(port_res["open"]) + " rtt=" + string(port_res["rtt_ms"]) + "ms");

    let ping_res = nt.tcp_ping("example.com", 443, 4).unwrap();
    println("TCP Ping avg=" + string(ping_res["avg_ms"]) + "ms loss=" + string(ping_res["loss_pct"]) + "%");
    return 0;
}
```

### 3. DNS-over-HTTPS, HTTP Inspection & RDAP/WHOIS

```matrix
import "nettools/lib" as nt;

fn main() {
    let dns = nt.dns_doh("example.com", "A").unwrap();
    println(json_write(dns["response"]));

    let http_res = nt.http_inspect("GET", "https://api64.ipify.org?format=json", null, null).unwrap();
    println("HTTP " + string(http_res["status"]) + ": " + http_res["body"]);

    let rdap = nt.whois_rdap("AS13335").unwrap();
    println("RDAP HTTP " + string(rdap["status"]));
    return 0;
}
```

### 4. Cross-Platform OS Diagnostics (`run_os_command`)

```matrix
import "nettools/lib" as nt;

fn main() {
    let res = nt.run_os_command("ping", map("host", "1.1.1.1", "count", 4));
    println("OS=" + res["os"] + " cmd=" + res["command"]);
    println(res["stdout"]);
    return 0;
}
```

---

## Optional Loopback Companion Server (`nettools-server`)

Run via global tool shim (after `spkg tool install nettools`) or directly from vendored files on `127.0.0.1:8787` (override port with `NETTOOLS_PORT`):

```bash
nettools-server
# Or from a project with vendor/nettools/:
spid3r run vendor/nettools/server.matrix
```

- **Loopback only:** Binds strictly to `127.0.0.1`.
- **Per-session authentication:** Generates a random 32-hex `X-NetTools-Token` verified with constant-time `secure_compare`.
- **No shell injection:** All inputs pass strict allowlist validation in `validate.matrix` and execute directly via `exec_capture(bin, argv, null)`.
