/**
 * os-commands.js — Cross-platform Windows / Linux / macOS / Spid3r command
 * equivalents for all 35 network diagnostic tools.
 */
(function (root, factory) {
  var V = root.NetTools && root.NetTools.Validators
    ? root.NetTools.Validators
    : (typeof require === 'function' ? require('./validators.js') : null);
  var api = factory(V);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.NetTools = root.NetTools || {};
  root.NetTools.OsCommands = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (V) {
  'use strict';

  function arg(val, fallback) {
    return V ? V.sanitizeCliArg(val, fallback) : (String(val || fallback || '').trim());
  }

  function num(val, lo, hi, fallback) {
    return V ? V.clampInt(val, lo, hi, fallback) : fallback;
  }

  function build(toolId, p) {
    p = p || {};
    var host = arg(p.host, '1.1.1.1');
    var domain = arg(p.domain || p.host, 'example.com');
    var ip = arg(p.ip || p.host, '8.8.8.8');
    var url = arg(p.url, 'https://example.com');
    var port = num(p.port, 1, 65535, 443);
    var count = num(p.count, 1, 20, 4);
    var rtype = arg(p.type, 'A').toUpperCase();
    var server = p.server ? arg(p.server, '') : '';

    switch (toolId) {
      case 'ping':
        return {
          windows: 'ping -n ' + count + ' -w ' + num(p.timeout_ms, 200, 10000, 2000) + ' ' + host,
          linux: 'ping -c ' + count + ' -W ' + Math.max(1, Math.ceil(num(p.timeout_ms, 200, 10000, 2000) / 1000)) + ' ' + host,
          macos: 'ping -c ' + count + ' -W ' + num(p.timeout_ms, 200, 10000, 2000) + ' ' + host,
          spid3r: 'nettools.run_os_command("ping", map("host", "' + host + '", "count", ' + count + '))',
          notes: 'ICMP Echo requires OS raw-socket execution (via Local Agent or local terminal).'
        };
      case 'traceroute': {
        var hops = num(p.max_hops, 1, 64, 30);
        var noDns = p.numeric !== false;
        return {
          windows: 'tracert -h ' + hops + (noDns ? ' -d ' : ' ') + host,
          linux: 'traceroute -m ' + hops + (noDns ? ' -n ' : ' ') + host,
          macos: 'traceroute -m ' + hops + (noDns ? ' -n ' : ' ') + host,
          spid3r: 'nettools.run_os_command("traceroute", map("host", "' + host + '", "max_hops", ' + hops + '))',
          notes: 'Windows uses ICMP tracert; Linux/macOS default to UDP probes unless -I/-T is passed.'
        };
      }
      case 'tcp-ping':
        return {
          windows: 'Test-NetConnection -ComputerName ' + host + ' -Port ' + port + '  # or: psping ' + host + ':' + port,
          linux: 'for i in $(seq 1 ' + count + '); do nc -vz -w 2 ' + host + ' ' + port + '; done',
          macos: 'for i in $(seq 1 ' + count + '); do nc -vz -G 2 ' + host + ' ' + port + '; done',
          spid3r: 'nettools.tcp_ping("' + host + '", ' + port + ', ' + count + ')',
          notes: 'Measures full TCP 3-way SYN/SYN-ACK/ACK handshake RTT without requiring ICMP.'
        };
      case 'port-checker': {
        var pList = arg(p.ports || port, '80,443');
        return {
          windows: pList.split(',').slice(0, 4).map(function (pt) {
            return 'Test-NetConnection -ComputerName ' + host + ' -Port ' + arg(pt, '443');
          }).join('; '),
          linux: 'nc -zv -w 2 ' + host + ' ' + pList.replace(/,/g, ' '),
          macos: 'nc -zv -G 2 ' + host + ' ' + pList.replace(/,/g, ' '),
          spid3r: 'nettools.check_port("' + host + '", ' + port + ')',
          notes: 'Browser cannot open raw TCP sockets; use Local Agent or copy command for direct port verification.'
        };
      }
      case 'nslookup':
        return {
          windows: 'nslookup -type=' + rtype + ' ' + domain + (server ? ' ' + server : ''),
          linux: 'nslookup -type=' + rtype + ' ' + domain + (server ? ' ' + server : ''),
          macos: 'nslookup -type=' + rtype + ' ' + domain + (server ? ' ' + server : ''),
          spid3r: 'nettools.dns_doh("' + domain + '", "' + rtype + '")',
          notes: 'Web workbench executes real DNS-over-HTTPS queries; Local Agent can invoke OS nslookup directly.'
        };
      case 'dig':
        return {
          windows: 'Resolve-DnsName -Name ' + domain + ' -Type ' + rtype + (server ? ' -Server ' + server : '') + '  # (or dig via BIND/WSL)',
          linux: 'dig ' + (server ? '@' + server + ' ' : '') + domain + ' ' + rtype + (p.short ? ' +short' : '') + (p.dnssec ? ' +dnssec' : ''),
          macos: 'dig ' + (server ? '@' + server + ' ' : '') + domain + ' ' + rtype + (p.short ? ' +short' : '') + (p.dnssec ? ' +dnssec' : ''),
          spid3r: 'nettools.dns_doh("' + domain + '", "' + rtype + '")',
          notes: 'PowerShell Resolve-DnsName is the native Windows equivalent to dig.'
        };
      case 'dns-lookup':
        return {
          windows: 'Resolve-DnsName -Name ' + domain + ' -Type ALL',
          linux: 'dig ' + domain + ' ANY +noall +answer || host -a ' + domain,
          macos: 'dig ' + domain + ' ANY +noall +answer || host -a ' + domain,
          spid3r: 'nettools.dns_doh("' + domain + '", "A")',
          notes: 'Queries A, AAAA, CNAME, MX, NS, TXT, and SOA records in parallel via DoH.'
        };
      case 'reverse-dns':
        return {
          windows: 'nslookup -type=PTR ' + ip + '  # PowerShell: Resolve-DnsName ' + ip + ' -Type PTR',
          linux: 'dig -x ' + ip + ' +short  # or: host ' + ip,
          macos: 'dig -x ' + ip + ' +short  # or: host ' + ip,
          spid3r: 'nettools.dns_doh("<reversed>.in-addr.arpa", "PTR")',
          notes: 'Converts IPv4 to .in-addr.arpa and IPv6 to 32-nibble .ip6.arpa automatically.'
        };
      case 'dns-propagation':
        return {
          windows: 'foreach ($s in "1.1.1.1","8.8.8.8","9.9.9.9") { Resolve-DnsName ' + domain + ' -Type ' + rtype + ' -Server $s }',
          linux: 'for s in 1.1.1.1 8.8.8.8 9.9.9.9 185.222.222.222; do echo "=== $s ==="; dig @$s ' + domain + ' ' + rtype + ' +short; done',
          macos: 'for s in 1.1.1.1 8.8.8.8 9.9.9.9 185.222.222.222; do echo "=== $s ==="; dig @$s ' + domain + ' ' + rtype + ' +short; done',
          spid3r: 'nettools.dns_doh("' + domain + '", "' + rtype + '")',
          notes: 'Queries 5 independent public DoH resolvers in parallel and compares answer consensus.'
        };
      case 'mx-lookup':
        return {
          windows: 'Resolve-DnsName -Name ' + domain + ' -Type MX',
          linux: 'dig ' + domain + ' MX +short && dig ' + domain + ' TXT +short',
          macos: 'dig ' + domain + ' MX +short && dig ' + domain + ' TXT +short',
          spid3r: 'nettools.dns_doh("' + domain + '", "MX")',
          notes: 'Resolves MX priorities, mail host A/AAAA IPs, and SPF/DMARC TXT records.'
        };
      case 'public-ip':
        return {
          windows: 'Invoke-RestMethod https://api64.ipify.org?format=json',
          linux: 'curl -s https://api64.ipify.org && echo ""',
          macos: 'curl -s https://api64.ipify.org && echo ""',
          spid3r: 'http_fetch("GET", "https://api64.ipify.org?format=json")',
          notes: 'Queries public IPv4/IPv6 echo endpoints plus ASN and geolocation.'
        };
      case 'private-ip': {
        var pip = arg(p.ip, '192.168.1.10');
        return {
          windows: 'Get-NetIPAddress -AddressFamily IPv4 | Format-Table InterfaceAlias,IPAddress,PrefixLength',
          linux: 'ip -4 -br addr show scope global',
          macos: 'ipconfig getifaddr en0 || ifconfig | grep "inet "',
          spid3r: 'nettools.classify_ipv4("' + pip + '")',
          notes: 'Classifies RFC 1918, RFC 6598 CGNAT, RFC 3927 APIPA, Loopback, Multicast, and Public scopes.'
        };
      }
      case 'ip-geolocation':
        return {
          windows: 'Invoke-RestMethod "https://ipwho.is/' + ip + '"',
          linux: 'curl -s "https://ipwho.is/' + ip + '" | python3 -m json.tool',
          macos: 'curl -s "https://ipwho.is/' + ip + '" | python3 -m json.tool',
          spid3r: 'http_fetch("GET", "https://ipwho.is/' + ip + '")',
          notes: 'Returns country, city, coordinates, timezone, ISP, and ASN metadata.'
        };
      case 'subnet-calc': {
        var cidr = arg(p.cidr, '192.168.1.10/24');
        return {
          windows: 'powershell -Command "# Calculate in Spid3r or ipmath.js for ' + cidr + '"',
          linux: 'ipcalc ' + cidr + '  # or: sipcalc ' + cidr,
          macos: 'ipcalc ' + cidr + '  # brew install ipcalc',
          spid3r: 'nettools.subnet_calc("' + cidr + '")',
          notes: 'Pure deterministic math: network, broadcast, wildcard, usable range, binary masks, and subnet splitting.'
        };
      }
      case 'cidr-calc': {
        var cA = arg(p.cidr, '10.10.0.0/16');
        return {
          windows: '# Use Spid3r nettools.subnet_calc("' + cA + '")',
          linux: 'sipcalc ' + cA,
          macos: 'ipcalc ' + cA,
          spid3r: 'nettools.subnet_calc("' + cA + '")',
          notes: 'Supports CIDR prefix inspection, IP membership tests, overlap detection, and VLSM splitting.'
        };
      }
      case 'ip-range-calc': {
        var sIp = arg(p.start, '192.168.1.0');
        var eIp = arg(p.end, '192.168.3.255');
        return {
          windows: '# Use Spid3r nettools.ip_range_calc("' + sIp + '", "' + eIp + '")',
          linux: 'aggregate -q   # or python3 -c "import ipaddress; print(list(ipaddress.summarize_address_range(ipaddress.IPv4Address(\'' + sIp + '\'), ipaddress.IPv4Address(\'' + eIp + '\'))))"',
          macos: 'python3 -c "import ipaddress; print(list(ipaddress.summarize_address_range(ipaddress.IPv4Address(\'' + sIp + '\'), ipaddress.IPv4Address(\'' + eIp + '\'))))"',
          spid3r: 'nettools.ip_range_calc("' + sIp + '", "' + eIp + '")',
          notes: 'Aggregates an arbitrary IPv4 range into the minimal exact set of CIDR prefixes.'
        };
      }
      case 'ipconfig':
        return {
          windows: p.all === false ? 'ipconfig' : 'ipconfig /all',
          linux: 'ip -c addr show && cat /etc/resolv.conf',
          macos: 'ifconfig -a && scutil --dns',
          spid3r: 'nettools.run_os_command("ipconfig", map("all", true))',
          notes: 'Local interface configuration requires OS execution (via Local Agent or terminal).'
        };
      case 'ifconfig':
        return {
          windows: 'ipconfig /all  # PowerShell: Get-NetIPConfiguration',
          linux: 'ifconfig -a  # modern: ip addr show',
          macos: 'ifconfig -a',
          spid3r: 'nettools.run_os_command("ifconfig", map())',
          notes: 'Displays interface flags, MTU, MAC address, and IPv4/IPv6 bindings.'
        };
      case 'hostname':
        return {
          windows: 'hostname && whoami',
          linux: p.fqdn ? 'hostname -f' : 'hostname',
          macos: 'hostname && scutil --get ComputerName',
          spid3r: 'nettools.run_os_command("hostname", map())',
          notes: 'Returns the local machine hostname (and FQDN on Linux when -f is set).'
        };
      case 'arp-table':
        return {
          windows: 'arp -a  # PowerShell: Get-NetNeighbor',
          linux: 'ip neighbor show  # legacy: arp -an',
          macos: 'arp -an',
          spid3r: 'nettools.run_os_command("arp", map())',
          notes: 'Inspects the local Layer-2 Neighbor/ARP cache mapping IPs to MAC addresses.'
        };
      case 'routing-table':
        return {
          windows: 'route print  # PowerShell: Get-NetRoute',
          linux: 'ip route show table all  # legacy: netstat -rn',
          macos: 'netstat -rn',
          spid3r: 'nettools.run_os_command("route", map())',
          notes: 'Shows kernel IPv4/IPv6 forwarding routes, gateways, interfaces, and metrics.'
        };
      case 'network-interfaces':
        return {
          windows: 'netsh interface ipv4 show interfaces  # PowerShell: Get-NetAdapter',
          linux: 'ip -br link show && ip -s link',
          macos: 'networksetup -listallhardwareports && netstat -i',
          spid3r: 'nettools.run_os_command("interfaces", map())',
          notes: 'Lists physical and virtual NICs, link state, MTU, and interface indexes.'
        };
      case 'netstat':
        return {
          windows: 'netstat -ano',
          linux: 'ss -tulnap  # legacy: netstat -tulnap',
          macos: 'netstat -anv -p tcp && netstat -anv -p udp',
          spid3r: 'nettools.run_os_command("netstat", map())',
          notes: 'Lists active sockets and owning PIDs; requires Local Agent or OS terminal.'
        };
      case 'tcp-udp-viewer':
        return {
          windows: 'Get-NetTCPConnection | Format-Table LocalAddress,LocalPort,RemoteAddress,RemotePort,State,OwningProcess',
          linux: 'ss -tunap',
          macos: 'lsof -iTCP -iUDP -nP',
          spid3r: 'nettools.run_os_command("connections", map())',
          notes: 'Filters live TCP state machines (LISTEN/ESTABLISHED/TIME_WAIT) and UDP endpoints.'
        };
      case 'open-ports':
        return {
          windows: 'netstat -an -p TCP | findstr LISTENING',
          linux: 'ss -tuln',
          macos: 'lsof -iTCP -sTCP:LISTEN -nP',
          spid3r: 'nettools.run_os_command("open_ports", map())',
          notes: 'Audits listening TCP/UDP services bound on local interfaces.'
        };
      case 'network-stats':
        return {
          windows: 'netstat -es',
          linux: 'netstat -s  # or: nstat -az',
          macos: 'netstat -s',
          spid3r: 'nettools.run_os_command("net_stats", map())',
          notes: 'Reports interface byte/packet counters and IP/TCP/UDP/ICMP protocol statistics.'
        };
      case 'curl': {
        var meth = arg(p.method, 'GET').toUpperCase();
        return {
          windows: 'curl.exe -i -X ' + meth + ' "' + url + '"',
          linux: 'curl -i -X ' + meth + ' "' + url + '"',
          macos: 'curl -i -X ' + meth + ' "' + url + '"',
          spid3r: 'nettools.http_inspect("' + meth + '", "' + url + '", null, null)',
          notes: 'Browser fetch obeys target CORS headers; Local Agent or curl CLI inspects all headers & body.'
        };
      }
      case 'http-headers':
        return {
          windows: 'curl.exe -sI "' + url + '"',
          linux: 'curl -sI "' + url + '"',
          macos: 'curl -sI "' + url + '"',
          spid3r: 'nettools.http_inspect("HEAD", "' + url + '", null, null)',
          notes: 'Audits caching and security headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options).'
        };
      case 'http-status':
        return {
          windows: 'curl.exe -s -o NUL -w "status=%{http_code} ttfb=%{time_starttransfer}s total=%{time_total}s\\n" "' + url + '"',
          linux: 'curl -s -o /dev/null -w "status=%{http_code} ttfb=%{time_starttransfer}s total=%{time_total}s\\n" "' + url + '"',
          macos: 'curl -s -o /dev/null -w "status=%{http_code} ttfb=%{time_starttransfer}s total=%{time_total}s\\n" "' + url + '"',
          spid3r: 'nettools.http_inspect("GET", "' + url + '", null, null)',
          notes: 'Checks HTTP status code and redirect target health.'
        };
      case 'ssl-checker':
        return {
          windows: 'openssl s_client -connect ' + host + ':' + port + ' -servername ' + host + ' </dev/null 2>/dev/null | openssl x509 -noout -subject -issuer -dates',
          linux: 'echo | openssl s_client -connect ' + host + ':' + port + ' -servername ' + host + ' 2>/dev/null | openssl x509 -noout -subject -issuer -dates -ext subjectAltName',
          macos: 'echo | openssl s_client -connect ' + host + ':' + port + ' -servername ' + host + ' 2>/dev/null | openssl x509 -noout -subject -issuer -dates',
          spid3r: 'nettools.run_os_command("ssl_check", map("host", "' + host + '", "port", ' + port + '))',
          notes: 'Web workbench queries public Certificate Transparency (crt.sh) + DNS CAA; openssl inspects live peer TLS handshake.'
        };
      case 'response-time':
        return {
          windows: 'curl.exe -s -o NUL -w "dns=%{time_namelookup}s connect=%{time_connect}s tls=%{time_appconnect}s ttfb=%{time_starttransfer}s total=%{time_total}s\\n" "' + url + '"',
          linux: 'curl -s -o /dev/null -w "dns=%{time_namelookup}s connect=%{time_connect}s tls=%{time_appconnect}s ttfb=%{time_starttransfer}s total=%{time_total}s\\n" "' + url + '"',
          macos: 'curl -s -o /dev/null -w "dns=%{time_namelookup}s connect=%{time_connect}s tls=%{time_appconnect}s ttfb=%{time_starttransfer}s total=%{time_total}s\\n" "' + url + '"',
          spid3r: 'nettools.http_inspect("GET", "' + url + '", null, null)',
          notes: 'Runs repeated browser timing probes (min/median/avg/p95/max/jitter).'
        };
      case 'whois': {
        var q = arg(p.query || domain, 'example.com');
        return {
          windows: 'curl.exe -s "https://rdap.org/domain/' + q + '"  # or Sysinternals whois ' + q,
          linux: 'whois ' + q,
          macos: 'whois ' + q,
          spid3r: 'nettools.whois_rdap("' + q + '")',
          notes: 'Browser workbench uses modern JSON RDAP (rdap.org) over HTTPS with CORS.'
        };
      }
      case 'domain-info':
        return {
          windows: 'Resolve-DnsName ' + domain + ' -Type NS; Invoke-RestMethod "https://rdap.org/domain/' + domain + '"',
          linux: 'whois ' + domain + ' && dig ' + domain + ' NS +short',
          macos: 'whois ' + domain + ' && dig ' + domain + ' NS +short',
          spid3r: 'nettools.whois_rdap("' + domain + '")',
          notes: 'Combines RDAP registration/EPP status with live NS, A/AAAA, MX, and CAA DNS queries.'
        };
      case 'asn-lookup': {
        var asnQ = arg(p.query, 'AS13335');
        return {
          windows: 'Invoke-RestMethod "https://stat.ripe.net/data/as-overview/data.json?resource=' + asnQ + '"',
          linux: 'whois -h whois.radb.net ' + asnQ + '  # or: curl -s "https://rdap.org/autnum/' + asnQ.replace(/^AS/i, '') + '"',
          macos: 'whois -h whois.radb.net ' + asnQ,
          spid3r: 'nettools.whois_rdap("' + asnQ + '")',
          notes: 'Supports AS numbers (AS13335), IP addresses, or hostnames via RIPEstat + RDAP.'
        };
      }
      case 'reverse-ip': {
        var target = arg(p.target, '93.184.216.34');
        return {
          windows: 'nslookup ' + target + ' && Invoke-RestMethod "https://api.hackertarget.com/reverseiplookup/?q=' + target + '"',
          linux: 'dig -x ' + target + ' +short && curl -s "https://api.hackertarget.com/reverseiplookup/?q=' + target + '"',
          macos: 'dig -x ' + target + ' +short && curl -s "https://api.hackertarget.com/reverseiplookup/?q=' + target + '"',
          spid3r: 'nettools.whois_rdap("' + target + '")',
          notes: 'Combines PTR reverse DNS, RDAP IP block, RIPEstat prefix/ASN, and shared-host lookup.'
        };
      }
      default:
        return {
          windows: '# ' + toolId,
          linux: '# ' + toolId,
          macos: '# ' + toolId,
          spid3r: 'import "nettools/lib" as nt;',
          notes: ''
        };
    }
  }

  return { build: build };
});
