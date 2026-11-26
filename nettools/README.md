# `nettools` — Spid3r Cross-Platform Network Diagnostics Toolkit

`nettools` (`0.1.0`) is an Ed25519-signed Spid3r package providing validated network diagnostics, deterministic IPv4/CIDR/range calculations, DNS-over-HTTPS (DoH), RDAP/WHOIS lookups, HTTP/TLS inspection, and cross-platform Windows / Linux / macOS CLI execution with an optional loopback-only companion server.

---

## Installation

```bash
spkg install nettools
# Or pin exact version:
spkg install nettools==0.1.0
```

Or declare in `spider.toml`:

```toml
[dependencies]
nettools = { version = "^0.1.0" }
```

Import in Spid3r (`.matrix`):

```matrix
import "nettools/lib" as nt;
```

---

## Quick Usage Examples

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

## Included Diagnostic Modules & Utilities

| Category | Capabilities | Entry / Function |
| :--- | :--- | :--- |
| **Connectivity** | Ping, Traceroute/Tracert, TCP Ping, Port Checker | `tcp_ping`, `check_port`, `run_os_command("ping" / "traceroute")` |
| **DNS** | NSLookup, Dig, DNS-over-HTTPS (A/AAAA/CNAME/MX/TXT/NS/SOA/PTR/SRV/CAA) | `dns_doh`, `run_os_command("nslookup" / "dig")` |
| **IP & Network Math** | Subnet Calc (`/0`–`/32`), CIDR Range Aggregation, RFC 1918 / 6598 / 3927 Classifier | `subnet_calc`, `ip_range_calc`, `classify_ipv4`, `parse_ipv4`, `format_ipv4` |
| **Network Configuration** | IPConfig, IfConfig, Hostname, ARP Table, Routing Table, Interfaces | `run_os_command("ipconfig" / "ifconfig" / "hostname" / "arp" / "route" / "interfaces")` |
| **Connection Monitoring** | Netstat, TCP/UDP Connections, Listening Ports, Network Statistics | `run_os_command("netstat" / "connections" / "open_ports" / "net_stats")` |
| **Web & HTTP** | HTTP Request / Header / Status Inspector, OpenSSL TLS Check | `http_inspect`, `run_os_command("ssl_check")` |
| **Domain & Infrastructure** | RDAP / WHOIS (Domain, IP, ASN) | `whois_rdap`, `run_os_command("whois")` |

---

## Cross-Platform OS Command Mapping

`src/commands.matrix` automatically adapts commands to Windows, Linux, and macOS via `detect_os()`:

| Diagnostic Tool | Windows | Linux | macOS |
| :--- | :--- | :--- | :--- |
| `ping` | `ping -n 4 -w 2000 <host>` | `ping -c 4 -W 2 <host>` | `ping -c 4 -W 2000 <host>` |
| `traceroute` | `tracert -h 30 -d <host>` | `traceroute -m 30 -n <host>` | `traceroute -m 30 -n <host>` |
| `ipconfig` | `ipconfig /all` | `ip addr show` | `ifconfig -a` |
| `arp` | `arp -a` | `arp -a` | `arp -a` |
| `route` | `route print` | `ip route show` | `netstat -rn` |
| `interfaces` | `netsh interface ipv4 show interfaces` | `ip -br link show` | `netstat -i` |
| `netstat` | `netstat -ano` | `ss -tulnp` | `netstat -anv` |
| `open_ports` | `netstat -an -p TCP` | `ss -tuln` | `lsof -iTCP -sTCP:LISTEN -nP` |
| `net_stats` | `netstat -es` | `netstat -s` | `netstat -s` |

---

## Optional Loopback Companion Server (`server.matrix`)

Run the bundled loopback-only API server if you want a local HTTP bridge on `127.0.0.1:8787` (override port with `NETTOOLS_PORT`):

```bash
spid3r run vendor/nettools/src/server.matrix
```

- **Loopback only:** Binds strictly to `127.0.0.1`.
- **Per-session authentication:** Generates a random 32-hex `X-NetTools-Token` verified with constant-time `secure_compare`.
- **No shell injection:** All inputs pass strict allowlist validation in `src/validate.matrix` and execute directly via `exec_capture(bin, argv, null)`.
