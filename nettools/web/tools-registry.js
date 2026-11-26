/**
 * tools-registry.js — Declarative definitions & execution handlers for all
 * 7 diagnostic categories and 35 network administration tools.
 */
(function (root, factory) {
  var V = root.NetTools && root.NetTools.Validators ? root.NetTools.Validators : require('./validators.js');
  var IP = root.NetTools && root.NetTools.IpMath ? root.NetTools.IpMath : require('./ip-math.js');
  var CMD = root.NetTools && root.NetTools.OsCommands ? root.NetTools.OsCommands : require('./os-commands.js');
  var API = root.NetTools && root.NetTools.ApiClient ? root.NetTools.ApiClient : require('./api-client.js');
  var res = factory(V, IP, CMD, API);
  if (typeof module === 'object' && module.exports) {
    module.exports = res;
  }
  root.NetTools = root.NetTools || {};
  root.NetTools.Categories = res.Categories;
  root.NetTools.Tools = res.Tools;
  root.NetTools.getTool = res.getTool;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (V, IP, CMD, API) {
  'use strict';

  var Categories = [
    { id: 'connectivity', name: 'Connectivity', icon: '⚡', desc: 'Reachability, hop paths, TCP handshakes, and ports' },
    { id: 'dns', name: 'DNS', icon: '🌐', desc: 'DoH resolution, dig, reverse PTR, propagation, and MX/SPF' },
    { id: 'ip-info', name: 'IP & Network Info', icon: '🧮', desc: 'Public IP, RFC scopes, geolocation, subnet, CIDR, and ranges' },
    { id: 'net-config', name: 'Network Config', icon: '🛠️', desc: 'Interface addresses, hostnames, ARP cache, and routing tables' },
    { id: 'conn-mon', name: 'Connection Monitoring', icon: '📡', desc: 'Active sockets, TCP/UDP viewers, open ports, and NIC stats' },
    { id: 'web-http', name: 'Web & HTTP', icon: '🔒', desc: 'HTTP requests, security headers, status, TLS certs, and latency' },
    { id: 'domain-infra', name: 'Domain & Infrastructure', icon: '🏢', desc: 'RDAP/WHOIS, domain posture, ASN routing, and reverse IP' }
  ];

  function line(text, kind) {
    return { text: String(text == null ? '' : text), kind: kind || 'info' };
  }

  function linesFromText(text, kind) {
    return String(text || '').replace(/\r\n/g, '\n').split('\n').map(function (l) {
      return line(l, kind || 'info');
    });
  }

  function pad(s, w) {
    s = String(s == null ? '' : s);
    return s.length >= w ? s + ' ' : s + new Array(w - s.length + 1).join(' ');
  }

  function resolverOptions() {
    return [
      { value: 'cloudflare', label: 'Cloudflare (1.1.1.1)' },
      { value: 'google', label: 'Google (8.8.8.8)' },
      { value: 'dnssb', label: 'DNS.SB (185.222.222.222)' },
      { value: 'cloudflare2', label: 'Cloudflare (1.0.0.1)' },
      { value: 'mozilla', label: 'Mozilla Cloudflare TRR' }
    ];
  }

  function dnsTypeOptions(includeAny) {
    var list = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SOA', 'PTR', 'SRV', 'CAA'];
    if (includeAny) list.push('ANY');
    return list.map(function (t) { return { value: t, label: t }; });
  }

  function checkAuth(values, tool) {
    if (tool.requiresAuth && !values.__authorized) {
      return 'Confirm target authorization before running active network diagnostics.';
    }
    return null;
  }

  function agentAvailable(ctx) {
    return ctx && ctx.agent && ctx.agent.connected;
  }

  function localFallbackResult(toolId, values, title, why) {
    var cmds = CMD.build(toolId, values);
    var out = [
      line('=== ' + title + ' (Browser Sandbox Notice) ===', 'head'),
      line(why, 'warn'),
      line('', 'info'),
      line('Equivalent commands for your host terminal or Spid3r Local Companion Agent:', 'accent'),
      line('  Windows : ' + cmds.windows, 'ok'),
      line('  Linux   : ' + cmds.linux, 'ok'),
      line('  macOS   : ' + cmds.macos, 'ok'),
      line('  Spid3r  : ' + cmds.spid3r, 'cyan'),
      line('', 'info'),
      line('Tip: Run "spkg install nettools && spid3r run vendor/nettools/src/server.matrix" and connect Local Agent in the top bar for live execution inside this terminal.', 'dim')
    ];
    return {
      ok: true,
      statusBadge: 'CLI / Agent Required',
      modeUsed: 'CLI Equivalent',
      kpis: [
        { k: 'Browser Mode', v: 'Sandboxed' },
        { k: 'Local Agent', v: 'Disconnected' },
        { k: 'Platforms', v: 'Win / Linux / macOS' }
      ],
      terminalLines: out,
      rawExport: out.map(function (x) { return x.text; }).join('\n')
    };
  }

  function formatAgentOsResult(toolTitle, res) {
    var out = [
      line('=== ' + toolTitle + ' (via Local Companion Agent · ' + (res.os || 'host') + ') ===', 'head'),
      line('$ ' + (res.command || ''), 'cyan'),
      line('', 'info')
    ];
    if (res.stdout) out = out.concat(linesFromText(res.stdout.trimEnd(), 'info'));
    if (res.stderr && res.stderr.trim()) {
      out.push(line('', 'info'));
      out = out.concat(linesFromText(res.stderr.trimEnd(), 'err'));
    }
    out.push(line('', 'info'));
    out.push(line('Exit code: ' + res.code + ' · Duration: ' + (res.duration_ms || 0) + ' ms', res.ok ? 'ok' : 'warn'));
    return {
      ok: !!res.ok,
      statusBadge: res.ok ? 'Exit 0 (' + (res.duration_ms || 0) + ' ms)' : 'Exit ' + res.code,
      modeUsed: 'Spid3r Local Agent (' + (res.os || 'OS') + ')',
      kpis: [
        { k: 'Execution', v: 'Local OS' },
        { k: 'Platform', v: String(res.os || 'unknown').toUpperCase() },
        { k: 'Exit Code', v: String(res.code) },
        { k: 'Duration', v: (res.duration_ms || 0) + ' ms' }
      ],
      terminalLines: out,
      rawExport: out.map(function (x) { return x.text; }).join('\n')
    };
  }

  // Helper for simple OS-only diagnostic tools
  function makeLocalOsTool(cfg) {
    return {
      id: cfg.id,
      agentTool: cfg.agentTool,
      category: cfg.category,
      name: cfg.name,
      mode: 'local',
      requiresAuth: !!cfg.requiresAuth,
      shortDesc: cfg.shortDesc,
      description: cfg.description,
      fields: cfg.fields || [],
      examples: cfg.examples || [{ label: 'Run Default', values: {}, note: 'Executes on connected host via Spid3r Local Agent' }],
      flagsGuide: cfg.flagsGuide || [],
      execute: function (values, ctx) {
        var authErr = checkAuth(values, this);
        if (authErr) return Promise.reject(new Error(authErr));
        if (cfg.validate) {
          var verr = cfg.validate(values);
          if (verr) return Promise.reject(new Error(verr));
        }
        if (agentAvailable(ctx)) {
          return API.runAgentTool(cfg.agentTool, values, !!values.__authorized, ctx.signal).then(function (res) {
            return formatAgentOsResult(cfg.name, res);
          });
        }
        return Promise.resolve(localFallbackResult(cfg.id, values, cfg.name, cfg.browserLimit));
      }
    };
  }

  function extractRdapSummary(d, fallbackQuery) {
    var entities = Array.isArray(d.entities) ? d.entities : [];
    var registrar = 'Unknown';
    for (var i = 0; i < entities.length; i++) {
      var roles = entities[i].roles || [];
      if (roles.indexOf('registrar') !== -1 && entities[i].vcardArray && Array.isArray(entities[i].vcardArray[1])) {
        var cards = entities[i].vcardArray[1];
        for (var j = 0; j < cards.length; j++) {
          if (cards[j][0] === 'fn') { registrar = String(cards[j][3]); break; }
        }
      }
    }
    var events = {};
    (d.events || []).forEach(function (ev) {
      if (ev.eventAction && ev.eventDate) events[ev.eventAction] = ev.eventDate;
    });
    var nss = (d.nameservers || []).map(function (n) { return n.ldhName || ''; }).filter(Boolean);
    return {
      handle: d.handle || '—',
      ldhName: d.ldhName || d.name || fallbackQuery,
      registrar: registrar,
      status: Array.isArray(d.status) ? d.status : [],
      created: events.registration || '—',
      updated: events['last changed'] || events['last update of RDAP database'] || '—',
      expires: events.expiration || '—',
      nameservers: nss,
      dnssec: d.secureDNS && typeof d.secureDNS.delegationSigned === 'boolean'
        ? (d.secureDNS.delegationSigned ? 'Signed' : 'Unsigned')
        : 'Unknown'
    };
  }

  // ==================== ALL 35 TOOLS ====================
  var Tools = [
    // ---------- 1. CONNECTIVITY ----------
    makeLocalOsTool({
      id: 'ping',
      agentTool: 'ping',
      category: 'connectivity',
      name: 'Ping',
      requiresAuth: true,
      shortDesc: 'ICMP Echo reachability & RTT packet loss diagnostics',
      description: 'Sends ICMP Echo Request packets to measure round-trip latency and packet loss. Browser JavaScript cannot craft raw ICMP packets; connect the Spid3r Local Companion Agent for live execution or copy the OS command.',
      browserLimit: 'Browsers cannot open raw ICMP sockets (RFC 792) for security reasons.',
      fields: [
        { key: 'host', label: 'Host or IP', type: 'text', defaultValue: '1.1.1.1', placeholder: 'e.g. 1.1.1.1 or example.com' },
        { key: 'count', label: 'Packet Count (1–20)', type: 'number', defaultValue: 4, min: 1, max: 20 },
        { key: 'timeout_ms', label: 'Timeout (ms)', type: 'number', defaultValue: 2000, min: 200, max: 10000 }
      ],
      examples: [
        { label: 'Cloudflare DNS', values: { host: '1.1.1.1', count: 4, timeout_ms: 2000 }, note: '4-packet ICMP test to 1.1.1.1' },
        { label: 'Google DNS', values: { host: '8.8.8.8', count: 5, timeout_ms: 1500 }, note: '5-packet latency baseline' }
      ],
      flagsGuide: [
        'Windows: -n <count> sets echo count; -w <ms> sets timeout.',
        'Linux: -c <count> sets count; -W <sec> sets per-packet timeout.',
        'macOS: -c <count> sets count; -W <ms> sets wait time.'
      ],
      validate: function (v) {
        var r = V.validateHostname(v.host);
        return r.ok ? null : r.error;
      }
    }),

    makeLocalOsTool({
      id: 'traceroute',
      agentTool: 'traceroute',
      category: 'connectivity',
      name: 'Traceroute / Tracert',
      requiresAuth: true,
      shortDesc: 'Trace Layer-3 router hops & per-hop latency to destination',
      description: 'Maps the IP path packets traverse across routers by incrementing TTL values from 1 up to max hops.',
      browserLimit: 'Browsers cannot set raw IP TTL socket options or receive ICMP Time Exceeded messages.',
      fields: [
        { key: 'host', label: 'Target Host or IP', type: 'text', defaultValue: '1.1.1.1', placeholder: 'e.g. example.com' },
        { key: 'max_hops', label: 'Max Hops (1–64)', type: 'number', defaultValue: 30, min: 1, max: 64 },
        { key: 'numeric', label: 'Skip Reverse DNS (-d / -n)', type: 'checkbox', defaultValue: true }
      ],
      examples: [
        { label: 'Trace 1.1.1.1', values: { host: '1.1.1.1', max_hops: 20, numeric: true }, note: 'Fast numeric hop trace' },
        { label: 'Trace example.com', values: { host: 'example.com', max_hops: 30, numeric: false }, note: 'Includes PTR router names' }
      ],
      flagsGuide: [
        '-d (Windows) / -n (Linux/macOS) avoids slow PTR lookups per hop.',
        '* * * indicates a router dropping ICMP/UDP probes (not necessarily packet loss).'
      ],
      validate: function (v) {
        var r = V.validateHostname(v.host);
        return r.ok ? null : r.error;
      }
    }),

    {
      id: 'tcp-ping',
      category: 'connectivity',
      name: 'TCP Ping',
      mode: 'hybrid',
      requiresAuth: true,
      shortDesc: 'Measure TCP handshake RTT on any host:port (works when ICMP is blocked)',
      description: 'Performs sequential TCP SYN/SYN-ACK handshakes via the Spid3r Local Agent, or measures HTTPS timing samples from the browser when probing HTTP/HTTPS ports.',
      fields: [
        { key: 'host', label: 'Host or IP', type: 'text', defaultValue: 'cloudflare-dns.com', placeholder: 'e.g. cloudflare-dns.com' },
        { key: 'port', label: 'TCP Port', type: 'number', defaultValue: 443, min: 1, max: 65535 },
        { key: 'count', label: 'Probes (1–10)', type: 'number', defaultValue: 4, min: 1, max: 10 }
      ],
      examples: [
        { label: 'Cloudflare HTTPS (443)', values: { host: 'cloudflare-dns.com', port: 443, count: 4 }, note: 'Tests TCP/HTTPS latency' },
        { label: 'SSH Port (22)', values: { host: 'github.com', port: 22, count: 4 }, note: 'Requires Local Agent for raw TCP port 22' }
      ],
      flagsGuide: [
        'Local Agent mode uses native Spid3r tcp_connect() for exact 3-way handshake timing on any port 1–65535.',
        'Browser mode can only estimate HTTP/HTTPS (80/443) latency via fetch() timing.'
      ],
      execute: function (values, ctx) {
        var authErr = checkAuth(values, this);
        if (authErr) return Promise.reject(new Error(authErr));
        var hr = V.validateHostname(values.host);
        if (!hr.ok) return Promise.reject(new Error(hr.error));
        var pr = V.validatePort(values.port);
        if (!pr.ok) return Promise.reject(new Error(pr.error));
        var cnt = V.clampInt(values.count, 1, 10, 4);

        if (agentAvailable(ctx)) {
          return API.runAgentTool('tcp_ping', { host: hr.value, port: pr.value, count: cnt }, true, ctx.signal).then(function (res) {
            var d = res.data;
            var out = [line('=== TCP Ping: ' + d.address + ' (Spid3r Local Agent) ===', 'head')];
            (d.samples || []).forEach(function (s) {
              out.push(line('  seq=' + s.seq + '  ' + (s.open ? 'OPEN  rtt=' + s.rtt_ms + ' ms' : 'FAIL  ' + s.detail), s.open ? 'ok' : 'err'));
            });
            out.push(line('', 'info'));
            out.push(line('Summary: sent=' + d.sent + ' ok=' + d.received + ' loss=' + d.loss_pct + '%  min/avg/max=' + d.min_ms + '/' + d.avg_ms + '/' + d.max_ms + ' ms', d.received > 0 ? 'accent' : 'err'));
            return {
              ok: d.received > 0,
              statusBadge: d.received + '/' + d.sent + ' OK (' + d.avg_ms + ' ms avg)',
              modeUsed: 'Spid3r Local Agent (TCP)',
              kpis: [
                { k: 'Target', v: d.address },
                { k: 'Success', v: d.received + '/' + d.sent },
                { k: 'Avg RTT', v: d.avg_ms + ' ms' },
                { k: 'Loss', v: d.loss_pct + '%' }
              ],
              terminalLines: out,
              structuredTable: { columns: ['Seq', 'State', 'RTT (ms)', 'Detail'], rows: (d.samples || []).map(function (s) { return [s.seq, s.open ? 'OPEN' : 'CLOSED', s.rtt_ms, s.detail]; }) },
              rawExport: out.map(function (x) { return x.text; }).join('\n')
            };
          });
        }

        if (pr.value !== 80 && pr.value !== 443) {
          return Promise.resolve(localFallbackResult('tcp-ping', values, 'TCP Ping (' + hr.value + ':' + pr.value + ')',
            'Browsers cannot open arbitrary raw TCP sockets (port ' + pr.value + '). Only HTTP/HTTPS (80/443) probes work without the Local Agent.'));
        }

        var scheme = pr.value === 443 ? 'https://' : 'http://';
        var url = scheme + hr.value + '/';
        var times = [];
        var failures = 0;
        var out = [
          line('=== Browser HTTPS Timing Probe (TCP+TLS Proxy): ' + url + ' ===', 'head'),
          line('Note: Without Local Agent, browser uses fetch(no-cors) which measures full HTTP/TLS round-trip rather than raw SYN/ACK.', 'dim')
        ];
        var chain = Promise.resolve();
        for (var i = 0; i < cnt; i++) {
          (function (idx) {
            chain = chain.then(function () {
              return API.probeHttpOnce({ url: url, method: 'HEAD', allowOpaqueFallback: true, timeoutMs: 6000 }, ctx.signal).then(function (r) {
                times.push(r.totalMs);
                out.push(line('  probe=' + (idx + 1) + '  reachable=yes  mode=' + r.mode + '  rtt=' + r.totalMs + ' ms', 'ok'));
              }).catch(function (e) {
                failures += 1;
                out.push(line('  probe=' + (idx + 1) + '  reachable=no   err=' + e.message, 'err'));
              });
            });
          })(i);
        }
        return chain.then(function () {
          var min = times.length ? Math.min.apply(null, times) : 0;
          var max = times.length ? Math.max.apply(null, times) : 0;
          var avg = times.length ? Math.round(times.reduce(function (a, b) { return a + b; }, 0) / times.length) : 0;
          out.push(line('', 'info'));
          out.push(line('Summary: probes=' + cnt + ' ok=' + times.length + ' failed=' + failures + '  min/avg/max=' + min + '/' + avg + '/' + max + ' ms', times.length ? 'accent' : 'err'));
          return {
            ok: times.length > 0,
            statusBadge: times.length + '/' + cnt + ' Reachable (' + avg + ' ms)',
            modeUsed: 'Browser Fetch Timing',
            kpis: [
              { k: 'Endpoint', v: hr.value + ':' + pr.value },
              { k: 'Reachable', v: times.length + '/' + cnt },
              { k: 'Avg RTT', v: avg + ' ms' },
              { k: 'Min / Max', v: min + ' / ' + max + ' ms' }
            ],
            terminalLines: out,
            rawExport: out.map(function (x) { return x.text; }).join('\n')
          };
        });
      }
    },

    {
      id: 'port-checker',
      category: 'connectivity',
      name: 'Port Connectivity Checker',
      mode: 'hybrid',
      requiresAuth: true,
      shortDesc: 'Test single or multiple TCP ports (up to 25 ports per check)',
      description: 'Checks whether specified TCP ports accept connections. Requires the Spid3r Local Companion Agent for non-HTTP ports (22, 53, 3306, 5432, etc.).',
      fields: [
        { key: 'host', label: 'Target Host or IP', type: 'text', defaultValue: '127.0.0.1', placeholder: 'e.g. 127.0.0.1 or example.com' },
        { key: 'ports', label: 'Ports (comma list or range, max 25)', type: 'text', defaultValue: '80,443', placeholder: 'e.g. 22,80,443,5432' }
      ],
      examples: [
        { label: 'Web Ports', values: { host: 'example.com', ports: '80,443' }, note: 'Check HTTP & HTTPS' },
        { label: 'Common Services (Agent)', values: { host: '127.0.0.1', ports: '22,80,443,5432,8787' }, note: 'Requires Local Agent for non-web ports' }
      ],
      flagsGuide: [
        'Bounded to 25 ports per diagnostic run to prevent abusive scanning.',
        'Only scan systems you own or have explicit authorization to test.'
      ],
      execute: function (values, ctx) {
        var authErr = checkAuth(values, this);
        if (authErr) return Promise.reject(new Error(authErr));
        var hr = V.validateHostname(values.host);
        if (!hr.ok) return Promise.reject(new Error(hr.error));
        var pr = V.validatePortList(values.ports, 25);
        if (!pr.ok) return Promise.reject(new Error(pr.error));

        if (!agentAvailable(ctx)) {
          return Promise.resolve(localFallbackResult('port-checker', { host: hr.value, port: pr.value[0], ports: pr.value.join(',') },
            'Port Connectivity Checker (' + hr.value + ')',
            'Browser JavaScript cannot open arbitrary raw TCP sockets to probe ports (' + pr.value.join(', ') + '). Connect the Spid3r Local Companion Agent or run the OS commands below.'));
        }

        var rows = [];
        var out = [line('=== TCP Port Connectivity Check: ' + hr.value + ' (Local Agent) ===', 'head')];
        var chain = Promise.resolve();
        pr.value.forEach(function (port) {
          chain = chain.then(function () {
            return API.runAgentTool('port_check', { host: hr.value, port: port }, true, ctx.signal).then(function (res) {
              var d = res.data || {};
              rows.push([port, d.open ? 'OPEN' : 'CLOSED / FILTERED', (d.rtt_ms || 0) + ' ms', d.message || '']);
              out.push(line('  ' + pad(hr.value + ':' + port, 26) + pad(d.open ? 'OPEN' : 'CLOSED', 10) + pad((d.rtt_ms || 0) + ' ms', 10) + (d.message || ''), d.open ? 'ok' : 'warn'));
            });
          });
        });
        return chain.then(function () {
          var openCount = rows.filter(function (r) { return r[1] === 'OPEN'; }).length;
          return {
            ok: true,
            statusBadge: openCount + '/' + rows.length + ' Open',
            modeUsed: 'Spid3r Local Agent',
            kpis: [
              { k: 'Host', v: hr.value },
              { k: 'Ports Tested', v: String(rows.length) },
              { k: 'Open', v: String(openCount) }
            ],
            terminalLines: out,
            structuredTable: { columns: ['Port', 'State', 'RTT', 'Detail'], rows: rows },
            rawExport: out.map(function (x) { return x.text; }).join('\n')
          };
        });
      }
    },

    // ---------- 2. DNS ----------
    {
      id: 'nslookup',
      category: 'dns',
      name: 'NSLookup',
      mode: 'live',
      requiresAuth: false,
      shortDesc: 'Interactive DNS query formatted like classic nslookup',
      description: 'Resolves DNS records via live DNS-over-HTTPS (DoH) JSON resolvers and formats the response in classic nslookup style.',
      fields: [
        { key: 'domain', label: 'Domain / Hostname', type: 'text', defaultValue: 'example.com', placeholder: 'e.g. github.com' },
        { key: 'type', label: 'Record Type', type: 'select', defaultValue: 'A', options: dnsTypeOptions(false) },
        { key: 'resolver', label: 'DoH Resolver', type: 'select', defaultValue: 'cloudflare', options: resolverOptions() }
      ],
      examples: [
        { label: 'A Record', values: { domain: 'github.com', type: 'A', resolver: 'cloudflare' }, note: 'IPv4 lookup' },
        { label: 'MX Records', values: { domain: 'google.com', type: 'MX', resolver: 'google' }, note: 'Mail exchangers' }
      ],
      flagsGuide: [
        'Queries public DoH endpoints directly from your browser with zero proxy.',
        'Shows Server, Non-authoritative answer, TTL, and DNS RCODE status.'
      ],
      execute: function (values, ctx) {
        var hr = V.validateHostname(values.domain);
        if (!hr.ok) return Promise.reject(new Error(hr.error));
        var tr = V.validateDnsType(values.type);
        if (!tr.ok) return Promise.reject(new Error(tr.error));

        return API.queryDoH(hr.value, tr.value, values.resolver, {}, ctx.signal).then(function (r) {
          var out = [
            line('Server:    ' + r.resolver.name, 'accent'),
            line('Address:   ' + r.resolver.ip + '#443 (DoH)', 'dim'),
            line('Status:    ' + r.statusName + ' (' + r.elapsedMs + ' ms)', r.rcode === 0 ? 'ok' : 'warn'),
            line('', 'info'),
            line('Non-authoritative answer:', 'head')
          ];
          if (!r.answers.length) {
            out.push(line('  (no ' + tr.value + ' records returned)', 'warn'));
          } else {
            r.answers.forEach(function (a) {
              out.push(line('  Name:    ' + a.name, 'info'));
              out.push(line('  Type:    ' + a.typeName + '   TTL: ' + a.ttl + 's', 'dim'));
              out.push(line('  Data:    ' + a.data, 'ok'));
              out.push(line('', 'info'));
            });
          }
          return {
            ok: r.rcode === 0,
            statusBadge: r.statusName + ' · ' + r.answers.length + ' answer(s)',
            modeUsed: 'Live DoH (' + r.resolver.ip + ')',
            kpis: [
              { k: 'Query', v: hr.value + ' (' + tr.value + ')' },
              { k: 'Status', v: r.statusName },
              { k: 'Answers', v: String(r.answers.length) },
              { k: 'Latency', v: r.elapsedMs + ' ms' }
            ],
            terminalLines: out,
            structuredTable: {
              columns: ['Name', 'Type', 'TTL (s)', 'Data'],
              rows: r.answers.map(function (a) { return [a.name, a.typeName, a.ttl, a.data]; })
            },
            rawExport: out.map(function (x) { return x.text; }).join('\n')
          };
        });
      }
    },

    {
      id: 'dig',
      category: 'dns',
      name: 'Dig',
      mode: 'live',
      requiresAuth: false,
      shortDesc: 'Full BIND-style dig DNS inspector with DNSSEC & +short modes',
      description: 'Performs detailed DNS-over-HTTPS queries including DNSSEC AD/CD flags, question/answer/authority sections, and +short output.',
      fields: [
        { key: 'domain', label: 'Domain Name', type: 'text', defaultValue: 'cloudflare.com', placeholder: 'e.g. cloudflare.com' },
        { key: 'type', label: 'Record Type', type: 'select', defaultValue: 'A', options: dnsTypeOptions(true) },
        { key: 'resolver', label: 'Resolver', type: 'select', defaultValue: 'cloudflare', options: resolverOptions() },
        { key: 'dnssec', label: 'Request DNSSEC (+dnssec / DO=1)', type: 'checkbox', defaultValue: true },
        { key: 'short', label: 'Compact Output (+short)', type: 'checkbox', defaultValue: false }
      ],
      examples: [
        { label: 'DNSSEC Verify', values: { domain: 'cloudflare.com', type: 'A', resolver: 'cloudflare', dnssec: true, short: false }, note: 'Shows AD flag' },
        { label: 'TXT +short', values: { domain: 'github.com', type: 'TXT', resolver: 'google', dnssec: false, short: true }, note: 'Compact answer lines' }
      ],
      flagsGuide: [
        'AD (Authenticated Data) indicates the resolver validated DNSSEC signatures.',
        '+short prints only the answer data values for scripting.'
      ],
      execute: function (values, ctx) {
        var hr = V.validateHostname(values.domain);
        if (!hr.ok) return Promise.reject(new Error(hr.error));
        var tr = V.validateDnsType(values.type);
        if (!tr.ok) return Promise.reject(new Error(tr.error));

        return API.queryDoH(hr.value, tr.value, values.resolver, { dnssec: !!values.dnssec }, ctx.signal).then(function (r) {
          var out = [];
          if (values.short) {
            r.answers.forEach(function (a) { out.push(line(a.data, 'ok')); });
            if (!out.length) out.push(line('; (no answer records)', 'warn'));
          } else {
            var flags = ['qr'];
            if (r.rd) flags.push('rd');
            if (r.ra) flags.push('ra');
            if (r.ad) flags.push('ad');
            if (r.cd) flags.push('cd');
            out.push(line('; <<>> Spid3r NetTools DiG (DoH) <<>> ' + hr.value + ' ' + tr.value, 'head'));
            out.push(line(';; ->>HEADER<<- opcode: QUERY, status: ' + r.statusName, r.rcode === 0 ? 'accent' : 'err'));
            out.push(line(';; flags: ' + flags.join(' ') + '; QUERY: 1, ANSWER: ' + r.answers.length + ', AUTHORITY: ' + r.authority.length, 'dim'));
            out.push(line('', 'info'));
            out.push(line(';; QUESTION SECTION:', 'accent'));
            out.push(line(';' + hr.value + '.\t\tIN\t' + tr.value, 'dim'));
            if (r.answers.length) {
              out.push(line('', 'info'));
              out.push(line(';; ANSWER SECTION:', 'accent'));
              r.answers.forEach(function (a) {
                out.push(line(pad(a.name, 26) + pad(a.ttl, 7) + 'IN  ' + pad(a.typeName, 7) + a.data, 'ok'));
              });
            }
            if (r.authority.length) {
              out.push(line('', 'info'));
              out.push(line(';; AUTHORITY SECTION:', 'accent'));
              r.authority.forEach(function (a) {
                out.push(line(pad(a.name, 26) + pad(a.ttl, 7) + 'IN  ' + pad(a.typeName, 7) + a.data, 'info'));
              });
            }
            out.push(line('', 'info'));
            out.push(line(';; Query time: ' + r.elapsedMs + ' msec', 'dim'));
            out.push(line(';; SERVER: ' + r.resolver.ip + '#443 (' + r.resolver.name + ')', 'dim'));
          }
          return {
            ok: r.rcode === 0,
            statusBadge: r.statusName + (r.ad ? ' · DNSSEC AD' : ''),
            modeUsed: 'Live DoH (' + r.resolver.ip + ')',
            kpis: [
              { k: 'Status', v: r.statusName },
              { k: 'DNSSEC AD', v: r.ad ? 'Authenticated' : 'Not Set' },
              { k: 'Answers', v: String(r.answers.length) },
              { k: 'Query Time', v: r.elapsedMs + ' ms' }
            ],
            terminalLines: out,
            structuredTable: {
              columns: ['Section', 'Name', 'TTL', 'Type', 'Data'],
              rows: r.answers.map(function (a) { return ['ANSWER', a.name, a.ttl, a.typeName, a.data]; })
                .concat(r.authority.map(function (a) { return ['AUTHORITY', a.name, a.ttl, a.typeName, a.data]; }))
            },
            rawExport: out.map(function (x) { return x.text; }).join('\n')
          };
        });
      }
    },

    {
      id: 'dns-lookup',
      category: 'dns',
      name: 'DNS Lookup (All Records)',
      mode: 'live',
      requiresAuth: false,
      shortDesc: 'Query A, AAAA, CNAME, MX, NS, TXT, SOA, and CAA in one sweep',
      description: 'Queries the core DNS record types concurrently via DoH and compiles a complete zone snapshot.',
      fields: [
        { key: 'domain', label: 'Domain Name', type: 'text', defaultValue: 'example.com', placeholder: 'e.g. example.com' },
        { key: 'resolver', label: 'DoH Resolver', type: 'select', defaultValue: 'cloudflare', options: resolverOptions() }
      ],
      examples: [
        { label: 'example.com', values: { domain: 'example.com', resolver: 'cloudflare' }, note: 'Full zone overview' },
        { label: 'github.com', values: { domain: 'github.com', resolver: 'google' }, note: 'Inspect CDN, MX, SPF & CAA' }
      ],
      flagsGuide: [
        'Runs 8 parallel DoH queries (A, AAAA, CNAME, MX, NS, TXT, SOA, CAA).',
        'Ideal for verifying DNS changes after migrations.'
      ],
      execute: function (values, ctx) {
        var hr = V.validateHostname(values.domain);
        if (!hr.ok) return Promise.reject(new Error(hr.error));
        var types = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA', 'CAA'];
        return Promise.all(types.map(function (t) {
          return API.queryDoH(hr.value, t, values.resolver, {}, ctx.signal).catch(function (e) {
            return { typeWanted: t, error: e.message, answers: [] };
          });
        })).then(function (results) {
          var out = [line('=== Comprehensive DNS Snapshot: ' + hr.value + ' ===', 'head')];
          var rows = [];
          var total = 0;
          results.forEach(function (res, idx) {
            var rtype = types[idx];
            if (res.error) {
              out.push(line('[' + rtype + '] error: ' + res.error, 'err'));
              return;
            }
            var matching = res.answers.filter(function (a) { return a.typeName === rtype || rtype === 'CNAME'; });
            if (!matching.length) {
              out.push(line('[' + pad(rtype, 5).trim() + '] (none)', 'dim'));
            } else {
              matching.forEach(function (a) {
                total += 1;
                rows.push([a.typeName, a.ttl, a.data]);
                out.push(line('[' + pad(a.typeName, 5).trim() + '] TTL=' + pad(a.ttl + 's', 7) + a.data, 'ok'));
              });
            }
          });
          return {
            ok: true,
            statusBadge: total + ' Record(s) Found',
            modeUsed: 'Live DoH Multi-Query',
            kpis: [
              { k: 'Domain', v: hr.value },
              { k: 'Record Types', v: String(types.length) },
              { k: 'Total Records', v: String(total) }
            ],
            terminalLines: out,
            structuredTable: { columns: ['Type', 'TTL (s)', 'Value'], rows: rows },
            rawExport: out.map(function (x) { return x.text; }).join('\n')
          };
        });
      }
    },

    {
      id: 'reverse-dns',
      category: 'dns',
      name: 'Reverse DNS Lookup (PTR)',
      mode: 'live',
      requiresAuth: false,
      shortDesc: 'Resolve IPv4/IPv6 addresses to PTR hostnames via arpa zones',
      description: 'Automatically converts IPv4 addresses into .in-addr.arpa and IPv6 addresses into 32-nibble .ip6.arpa names and queries PTR records via DoH.',
      fields: [
        { key: 'ip', label: 'IPv4 or IPv6 Address', type: 'text', defaultValue: '8.8.8.8', placeholder: 'e.g. 8.8.8.8 or 2606:4700:4700::1111' },
        { key: 'resolver', label: 'DoH Resolver', type: 'select', defaultValue: 'cloudflare', options: resolverOptions() }
      ],
      examples: [
        { label: 'Google 8.8.8.8', values: { ip: '8.8.8.8', resolver: 'cloudflare' }, note: 'dns.google PTR' },
        { label: 'Cloudflare IPv6', values: { ip: '2606:4700:4700::1111', resolver: 'google' }, note: 'ip6.arpa PTR' }
      ],
      flagsGuide: [
        'Validates IPv4/IPv6 syntax before building the .arpa reverse zone.',
        'Useful for verifying mail-server FCrDNS (Forward-Confirmed Reverse DNS).'
      ],
      execute: function (values, ctx) {
        var ipRes = V.validateIP(values.ip);
        if (!ipRes.ok) return Promise.reject(new Error(ipRes.error));
        var ptrName = ipRes.version === 4 ? IP.ipv4ToPtr(ipRes.value) : IP.ipv6ToPtr(ipRes.value);
        return API.queryDoH(ptrName, 'PTR', values.resolver, {}, ctx.signal).then(function (r) {
          var ptrs = r.answers.filter(function (a) { return a.typeName === 'PTR'; });
          var out = [
            line('=== Reverse DNS (PTR) Lookup ===', 'head'),
            line('Input IP   : ' + ipRes.value + ' (IPv' + ipRes.version + ')', 'info'),
            line('ARPA Query : ' + ptrName, 'cyan'),
            line('Status     : ' + r.statusName + ' (' + r.elapsedMs + ' ms)', r.rcode === 0 ? 'ok' : 'warn'),
            line('', 'info')
          ];
          if (!ptrs.length) {
            out.push(line('No PTR record published for ' + ipRes.value, 'warn'));
          } else {
            ptrs.forEach(function (p) {
              out.push(line('  PTR -> ' + p.data + '  (TTL ' + p.ttl + 's)', 'ok'));
            });
          }
          return {
            ok: r.rcode === 0,
            statusBadge: ptrs.length ? ptrs[0].data : r.statusName,
            modeUsed: 'Live DoH PTR',
            kpis: [
              { k: 'IP', v: ipRes.value },
              { k: 'PTR Host', v: ptrs.length ? ptrs[0].data : 'None' },
              { k: 'Latency', v: r.elapsedMs + ' ms' }
            ],
            terminalLines: out,
            structuredTable: { columns: ['ARPA Zone', 'PTR Hostname', 'TTL (s)'], rows: ptrs.map(function (p) { return [ptrName, p.data, p.ttl]; }) },
            rawExport: out.map(function (x) { return x.text; }).join('\n')
          };
        });
      }
    },

    {
      id: 'dns-propagation',
      category: 'dns',
      name: 'DNS Propagation Checker',
      mode: 'live',
      requiresAuth: false,
      shortDesc: 'Compare answers & consensus across 5 independent DoH resolvers',
      description: 'Queries Cloudflare (1.1.1.1 / 1.0.0.1), Google (8.8.8.8), DNS.SB (185.222.222.222), and Mozilla TRR simultaneously to check global DNS consistency.',
      fields: [
        { key: 'domain', label: 'Domain Name', type: 'text', defaultValue: 'example.com', placeholder: 'e.g. example.com' },
        { key: 'type', label: 'Record Type', type: 'select', defaultValue: 'A', options: dnsTypeOptions(false) }
      ],
      examples: [
        { label: 'example.com A', values: { domain: 'example.com', type: 'A' }, note: 'Compare 5 resolvers' },
        { label: 'cloudflare.com NS', values: { domain: 'cloudflare.com', type: 'NS' }, note: 'Check NS delegation parity' }
      ],
      flagsGuide: [
        'Green consensus indicates all responding resolvers agree on the sorted answer set.',
        'Divergence may indicate active propagation, GeoDNS routing, or stale caches.'
      ],
      execute: function (values, ctx) {
        var hr = V.validateHostname(values.domain);
        if (!hr.ok) return Promise.reject(new Error(hr.error));
        var tr = V.validateDnsType(values.type);
        if (!tr.ok) return Promise.reject(new Error(tr.error));
        var keys = Object.keys(API.DOH_RESOLVERS);
        return Promise.all(keys.map(function (k) {
          return API.queryDoH(hr.value, tr.value, k, {}, ctx.signal).catch(function (e) {
            return { resolver: API.DOH_RESOLVERS[k], error: e.message, answers: [] };
          });
        })).then(function (results) {
          var sets = {};
          var rows = [];
          var out = [line('=== DNS Propagation Check: ' + hr.value + ' (' + tr.value + ') ===', 'head')];
          results.forEach(function (r) {
            if (r.error) {
              rows.push([r.resolver.name, r.resolver.ip, 'ERROR', '—', r.error]);
              out.push(line('  [ERR] ' + pad(r.resolver.name, 30) + r.error, 'err'));
              return;
            }
            var vals = r.answers.filter(function (a) { return a.typeName === tr.value; }).map(function (a) { return a.data; }).sort();
            if (!vals.length) vals = r.answers.map(function (a) { return a.typeName + ':' + a.data; }).sort();
            var sig = vals.join(' | ') || '(empty)';
            sets[sig] = (sets[sig] || 0) + 1;
            rows.push([r.resolver.name, r.resolver.ip, r.statusName, r.elapsedMs + ' ms', sig]);
            out.push(line('  [' + pad(r.statusName, 8).trim() + '] ' + pad(r.resolver.name, 30) + pad(r.elapsedMs + 'ms', 8) + sig, r.rcode === 0 ? 'ok' : 'warn'));
          });
          var distinctSets = Object.keys(sets).length;
          var consensus = distinctSets === 1 ? '100% Consensus' : (distinctSets + ' Distinct Answer Sets');
          out.push(line('', 'info'));
          out.push(line('Consensus: ' + consensus, distinctSets === 1 ? 'accent' : 'warn'));
          return {
            ok: true,
            statusBadge: consensus,
            modeUsed: '5-Resolver DoH Matrix',
            kpis: [
              { k: 'Resolvers Queried', v: String(results.length) },
              { k: 'Distinct Answers', v: String(distinctSets) },
              { k: 'Consensus', v: distinctSets === 1 ? 'Aligned' : 'Split / GeoDNS' }
            ],
            terminalLines: out,
            structuredTable: { columns: ['Resolver', 'IP', 'Status', 'Latency', 'Answers'], rows: rows },
            rawExport: out.map(function (x) { return x.text; }).join('\n')
          };
        });
      }
    },

    {
      id: 'mx-lookup',
      category: 'dns',
      name: 'MX & Mail Security Lookup',
      mode: 'live',
      requiresAuth: false,
      shortDesc: 'Resolve MX priorities, mail host IPs, SPF, and DMARC records',
      description: 'Inspects domain MX exchange records, resolves each mail server hostname to A/AAAA IPs, and checks TXT records for SPF and _dmarc policies.',
      fields: [
        { key: 'domain', label: 'Domain Name', type: 'text', defaultValue: 'gmail.com', placeholder: 'e.g. gmail.com' },
        { key: 'resolver', label: 'DoH Resolver', type: 'select', defaultValue: 'cloudflare', options: resolverOptions() }
      ],
      examples: [
        { label: 'gmail.com', values: { domain: 'gmail.com', resolver: 'cloudflare' }, note: 'MX + SPF + DMARC' },
        { label: 'github.com', values: { domain: 'github.com', resolver: 'google' }, note: 'Inspect mail posture' }
      ],
      flagsGuide: [
        'Lower MX preference numbers have higher delivery priority.',
        'Checks root TXT (v=spf1) and _dmarc.<domain> TXT (v=DMARC1).'
      ],
      execute: function (values, ctx) {
        var hr = V.validateHostname(values.domain);
        if (!hr.ok) return Promise.reject(new Error(hr.error));
        return Promise.all([
          API.queryDoH(hr.value, 'MX', values.resolver, {}, ctx.signal),
          API.queryDoH(hr.value, 'TXT', values.resolver, {}, ctx.signal).catch(function () { return { answers: [] }; }),
          API.queryDoH('_dmarc.' + hr.value, 'TXT', values.resolver, {}, ctx.signal).catch(function () { return { answers: [] }; })
        ]).then(function (arr) {
          var mxRes = arr[0], txtRes = arr[1], dmarcRes = arr[2];
          var mxList = mxRes.answers.filter(function (a) { return a.typeName === 'MX'; }).map(function (a) {
            var parts = a.data.trim().split(/\s+/);
            return { pref: parseInt(parts[0], 10) || 0, host: (parts[1] || a.data).replace(/\.$/, ''), ttl: a.ttl };
          }).sort(function (a, b) { return a.pref - b.pref; });

          return Promise.all(mxList.slice(0, 6).map(function (m) {
            return API.queryDoH(m.host, 'A', values.resolver, {}, ctx.signal).then(function (ar) {
              return ar.answers.filter(function (x) { return x.typeName === 'A'; }).map(function (x) { return x.data; });
            }).catch(function () { return []; });
          })).then(function (ipLists) {
            var out = [line('=== MX & Mail Security Audit: ' + hr.value + ' ===', 'head')];
            var rows = [];
            if (!mxList.length) {
              out.push(line('No MX records found.', 'warn'));
            } else {
              mxList.forEach(function (m, idx) {
                var ips = (ipLists[idx] || []).join(', ') || '—';
                rows.push([m.pref, m.host, m.ttl, ips]);
                out.push(line('  Pref ' + pad(m.pref, 5) + pad(m.host, 36) + 'TTL=' + pad(m.ttl + 's', 7) + 'IPs: ' + ips, 'ok'));
              });
            }
            var spf = txtRes.answers.filter(function (a) { return a.data.toLowerCase().indexOf('v=spf1') !== -1; });
            var dmarc = dmarcRes.answers.filter(function (a) { return a.data.toLowerCase().indexOf('v=dmarc1') !== -1; });
            out.push(line('', 'info'));
            out.push(line('SPF   : ' + (spf.length ? spf[0].data : 'Not detected'), spf.length ? 'accent' : 'warn'));
            out.push(line('DMARC : ' + (dmarc.length ? dmarc[0].data : 'Not detected'), dmarc.length ? 'accent' : 'warn'));
            return {
              ok: true,
              statusBadge: mxList.length + ' MX · SPF ' + (spf.length ? 'OK' : 'Missing'),
              modeUsed: 'Live DoH Mail Audit',
              kpis: [
                { k: 'MX Records', v: String(mxList.length) },
                { k: 'Primary MX', v: mxList.length ? mxList[0].host : 'None' },
                { k: 'SPF', v: spf.length ? 'Present' : 'Missing' },
                { k: 'DMARC', v: dmarc.length ? 'Present' : 'Missing' }
              ],
              terminalLines: out,
              structuredTable: { columns: ['Priority', 'Mail Server', 'TTL (s)', 'Resolved IPs'], rows: rows },
              rawExport: out.map(function (x) { return x.text; }).join('\n')
            };
          });
        });
      }
    },

    // ---------- 3. IP & NETWORK INFO ----------
    {
      id: 'public-ip',
      category: 'ip-info',
      name: 'Public IP Lookup',
      mode: 'live',
      requiresAuth: false,
      shortDesc: 'Detect your public egress IPv4/IPv6, PTR, ASN, and ISP',
      description: 'Queries CORS-enabled public IP echo endpoints (api64.ipify.org, api.ipify.org, ipwho.is) and resolves reverse PTR.',
      fields: [],
      examples: [{ label: 'Detect My Public IP', values: {}, note: 'Shows current egress IP and ISP' }],
      flagsGuide: [
        'Uses dual-stack api64.ipify.org + IPv4-only api.ipify.org to detect IPv4 and IPv6 separately.',
        'Results reflect your current outbound network/VPN gateway.'
      ],
      execute: function (_values, ctx) {
        return API.fetchPublicIp(ctx.signal).then(function (res) {
          var ptrName = res.primaryIp.indexOf(':') !== -1 ? IP.ipv6ToPtr(res.primaryIp) : IP.ipv4ToPtr(res.primaryIp);
          return API.queryDoH(ptrName, 'PTR', 'cloudflare', {}, ctx.signal).catch(function () { return { answers: [] }; }).then(function (ptr) {
            var ptrHost = ptr.answers.length ? ptr.answers[0].data : 'None';
            var g = res.geo || {};
            var isp = g.connection ? (g.connection.isp || g.connection.org || '—') : '—';
            var asn = g.connection && g.connection.asn ? ('AS' + g.connection.asn) : '—';
            var loc = [g.city, g.region, g.country].filter(Boolean).join(', ') || '—';
            var out = [
              line('=== Public Egress IP Information ===', 'head'),
              line('Primary IP : ' + res.primaryIp, 'ok'),
              line('IPv4       : ' + (res.ipv4 || 'Not detected'), 'info'),
              line('IPv6       : ' + (res.ipv6 || 'Not detected'), 'info'),
              line('PTR Host   : ' + ptrHost, 'cyan'),
              line('ASN / ISP  : ' + asn + ' · ' + isp, 'info'),
              line('Location   : ' + loc, 'info')
            ];
            return {
              ok: true,
              statusBadge: res.primaryIp,
              modeUsed: 'Live Echo + Geo',
              kpis: [
                { k: 'Public IP', v: res.primaryIp },
                { k: 'ASN', v: asn },
                { k: 'ISP', v: isp },
                { k: 'Location', v: loc }
              ],
              terminalLines: out,
              rawExport: out.map(function (x) { return x.text; }).join('\n')
            };
          });
        });
      }
    },

    {
      id: 'private-ip',
      category: 'ip-info',
      name: 'Private & Special IP Classifier',
      mode: 'offline',
      requiresAuth: false,
      shortDesc: 'Inspect RFC 1918, CGNAT, APIPA, Loopback, Multicast, and IPv6 scopes',
      description: 'Deterministically classifies any IPv4 or IPv6 address into its IANA/RFC scope, class, routability, binary representation, hex, and reverse PTR zone.',
      fields: [
        { key: 'ip', label: 'IPv4 or IPv6 Address', type: 'text', defaultValue: '192.168.1.42', placeholder: 'e.g. 10.20.30.40 or fe80::1' }
      ],
      examples: [
        { label: 'RFC 1918 LAN', values: { ip: '192.168.1.42' }, note: 'Private IPv4' },
        { label: 'CGNAT 100.64', values: { ip: '100.64.12.5' }, note: 'RFC 6598 ISP CGNAT' },
        { label: 'IPv6 Link-Local', values: { ip: 'fe80::1ff:fe23:4567:890a' }, note: 'RFC 4291 scope' }
      ],
      flagsGuide: [
        '10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 = RFC 1918 private.',
        '100.64.0.0/10 = RFC 6598 CGNAT; 169.254.0.0/16 = RFC 3927 APIPA.'
      ],
      execute: function (values) {
        var vr = V.validateIP(values.ip);
        if (!vr.ok) return Promise.reject(new Error(vr.error));
        if (vr.version === 4) {
          var info = IP.classifyIPv4(vr.value);
          var out = [
            line('=== IPv4 Address Classification ===', 'head'),
            line('Address    : ' + info.ip, 'ok'),
            line('Scope      : ' + info.scope, info.isPrivate || info.isSpecial ? 'accent' : 'cyan'),
            line('RFC / Ref  : ' + info.rfc, 'info'),
            line('Class      : ' + info.ipClass, 'info'),
            line('Routable   : ' + (info.isRoutable ? 'Yes (Public Internet)' : 'No (Private / Special-Use)'), 'info'),
            line('Binary     : ' + info.binary, 'dim'),
            line('Hex / Int  : ' + info.hex + ' (' + info.integer + ')', 'dim'),
            line('Reverse PTR: ' + info.ptr, 'dim'),
            line('Notes      : ' + info.description, 'info')
          ];
          return Promise.resolve({
            ok: true,
            statusBadge: info.scope,
            modeUsed: 'Offline Deterministic Math',
            kpis: [
              { k: 'IP', v: info.ip },
              { k: 'Scope', v: info.scope },
              { k: 'Class', v: info.ipClass },
              { k: 'Routable', v: info.isRoutable ? 'Public' : 'Non-Routable' }
            ],
            terminalLines: out,
            rawExport: out.map(function (x) { return x.text; }).join('\n')
          });
        }
        var v6 = IP.classifyIPv6(vr.value);
        var out6 = [
          line('=== IPv6 Address Classification ===', 'head'),
          line('Compressed : ' + v6.compressed, 'ok'),
          line('Expanded   : ' + v6.expanded, 'info'),
          line('Scope      : ' + v6.scope, 'accent'),
          line('RFC / Ref  : ' + v6.rfc, 'info'),
          line('Reverse PTR: ' + v6.ptr, 'dim')
        ];
        return Promise.resolve({
          ok: true,
          statusBadge: v6.scope,
          modeUsed: 'Offline Deterministic Math',
          kpis: [
            { k: 'Compressed', v: v6.compressed },
            { k: 'Scope', v: v6.scope },
            { k: 'RFC', v: v6.rfc }
          ],
          terminalLines: out6,
          rawExport: out6.map(function (x) { return x.text; }).join('\n')
        });
      }
    },

    {
      id: 'ip-geolocation',
      category: 'ip-info',
      name: 'IP Geolocation',
      mode: 'live',
      requiresAuth: false,
      shortDesc: 'Lookup country, city, timezone, coordinates, ISP, and ASN for an IP',
      description: 'Resolves hostnames to IPv4 if needed and retrieves geolocation and network ownership data from ipwho.is.',
      fields: [
        { key: 'target', label: 'IP Address or Hostname', type: 'text', defaultValue: '8.8.8.8', placeholder: 'e.g. 8.8.8.8 or cloudflare.com' }
      ],
      examples: [
        { label: '8.8.8.8', values: { target: '8.8.8.8' }, note: 'Google DNS' },
        { label: '1.1.1.1', values: { target: '1.1.1.1' }, note: 'Cloudflare Anycast' }
      ],
      flagsGuide: [
        'Accepts public IPv4, IPv6, or a domain name (resolved via DoH A record first).'
      ],
      execute: function (values, ctx) {
        var hr = V.validateHostname(values.target);
        if (!hr.ok) return Promise.reject(new Error(hr.error));
        var ipCheck = V.validateIP(hr.value);
        var resolveIp = ipCheck.ok
          ? Promise.resolve(ipCheck.value)
          : API.queryDoH(hr.value, 'A', 'cloudflare', {}, ctx.signal).then(function (r) {
            var a = r.answers.find(function (x) { return x.typeName === 'A'; });
            if (!a) throw new Error('No A record found for ' + hr.value);
            return a.data;
          });

        return resolveIp.then(function (ip) {
          return API.fetchIpGeo(ip, ctx.signal).then(function (res) {
            var d = res.data;
            var conn = d.connection || {};
            var tz = d.timezone || {};
            var out = [
              line('=== IP Geolocation: ' + d.ip + ' ===', 'head'),
              line('Country     : ' + (d.country || '—') + ' (' + (d.country_code || '') + ') · ' + (d.continent || ''), 'ok'),
              line('Region/City : ' + [d.city, d.region, d.postal].filter(Boolean).join(', '), 'info'),
              line('Coordinates : ' + d.latitude + ', ' + d.longitude, 'cyan'),
              line('Timezone    : ' + (tz.id || '—') + ' (' + (tz.utc || '') + ')', 'info'),
              line('ASN         : ' + (conn.asn ? 'AS' + conn.asn : '—'), 'accent'),
              line('ISP / Org   : ' + [conn.isp, conn.org].filter(Boolean).join(' / '), 'info'),
              line('Domain      : ' + (conn.domain || '—'), 'dim')
            ];
            return {
              ok: true,
              statusBadge: (d.city ? d.city + ', ' : '') + (d.country_code || d.ip),
              modeUsed: 'Live Geolocation API',
              kpis: [
                { k: 'IP', v: d.ip },
                { k: 'Location', v: [d.city, d.country_code].filter(Boolean).join(', ') || '—' },
                { k: 'ASN', v: conn.asn ? 'AS' + conn.asn : '—' },
                { k: 'ISP', v: conn.isp || '—' }
              ],
              terminalLines: out,
              rawExport: out.map(function (x) { return x.text; }).join('\n')
            };
          });
        });
      }
    },

    {
      id: 'subnet-calc',
      category: 'ip-info',
      name: 'Subnet Calculator',
      mode: 'offline',
      requiresAuth: false,
      shortDesc: 'Compute network, broadcast, usable range, wildcard, binary masks & split subnets',
      description: 'Full IPv4 & IPv6 subnetting calculator with RFC 3021 (/31) and /32 host-route support, plus optional subnet splitting.',
      fields: [
        { key: 'cidr', label: 'IPv4/IPv6 Address or CIDR', type: 'text', defaultValue: '192.168.10.45/24', placeholder: 'e.g. 192.168.10.45/24 or 2001:db8::/48' },
        { key: 'mask', label: 'Subnet Mask or Prefix Override (optional)', type: 'text', defaultValue: '', placeholder: 'e.g. 255.255.255.192 or /26' },
        { key: 'split_prefix', label: 'Split Into Prefix (optional IPv4)', type: 'text', defaultValue: '', placeholder: 'e.g. 26 (splits /24 into 4x /26)' }
      ],
      examples: [
        { label: '/24 Split to /26', values: { cidr: '192.168.10.45/24', mask: '', split_prefix: '26' }, note: 'Shows 4 child subnets' },
        { label: '/31 Point-to-Point', values: { cidr: '10.0.0.1/31', mask: '', split_prefix: '' }, note: 'RFC 3021 link subnet' },
        { label: 'IPv6 /48', values: { cidr: '2001:db8:abcd::1/48', mask: '', split_prefix: '' }, note: 'IPv6 subnet boundaries' }
      ],
      flagsGuide: [
        'Handles /0, /31 (2 usable hosts per RFC 3021), and /32 (1 host).',
        'Subnet splitting caps display at 256 rows for instant UI responsiveness.'
      ],
      execute: function (values) {
        var raw = String(values.cidr || '').trim();
        if (!raw) return Promise.reject(new Error('Enter an IP or CIDR block.'));
        var isV6 = raw.indexOf(':') !== -1;
        if (isV6) {
          var c6 = raw.indexOf('/') !== -1 ? raw : (raw + '/64');
          var cr6 = V.validateCIDR(c6);
          if (!cr6.ok) return Promise.reject(new Error(cr6.error));
          var s6 = IP.calculateSubnetV6(cr6.value);
          var out6 = [
            line('=== IPv6 Subnet Calculation ===', 'head'),
            line('CIDR           : ' + s6.cidr, 'ok'),
            line('Network        : ' + s6.network + ' (' + s6.expandedNetwork + ')', 'cyan'),
            line('First Address  : ' + s6.firstAddress, 'info'),
            line('Last Address   : ' + s6.lastAddress, 'info'),
            line('Total Addresses: ' + s6.totalAddresses, 'accent'),
            line('Scope          : ' + s6.scope + ' (' + s6.rfc + ')', 'info'),
            line('Reverse Zone   : ' + s6.ptr, 'dim')
          ];
          return Promise.resolve({
            ok: true,
            statusBadge: s6.cidr,
            modeUsed: 'Offline Deterministic Math',
            kpis: [
              { k: 'CIDR', v: s6.cidr },
              { k: 'Prefix', v: '/' + s6.prefix },
              { k: 'Scope', v: s6.scope }
            ],
            terminalLines: out6,
            rawExport: out6.map(function (x) { return x.text; }).join('\n')
          });
        }

        var ipOnly = raw.split('/')[0];
        var ipVal = V.validateIPv4(ipOnly);
        if (!ipVal.ok) return Promise.reject(new Error(ipVal.error));
        var maskOverride = String(values.mask || '').trim();
        var sub = IP.calculateSubnet(raw, maskOverride);
        var out = [
          line('=== IPv4 Subnet Calculation: ' + sub.cidr + ' ===', 'head'),
          line('Input IP       : ' + sub.inputIp, 'info'),
          line('Network / CIDR : ' + sub.cidr + (sub.rfc3021 ? '  [RFC 3021 P2P]' : ''), 'ok'),
          line('Subnet Mask    : ' + sub.netmask + ' (/' + sub.prefix + ')', 'cyan'),
          line('Wildcard Mask  : ' + sub.wildcard, 'info'),
          line('Broadcast Addr : ' + sub.broadcast, 'info'),
          line('Usable Range   : ' + sub.firstHost + ' — ' + sub.lastHost, 'accent'),
          line('Total / Usable : ' + sub.totalAddresses.toLocaleString() + ' total / ' + sub.usableHosts.toLocaleString() + ' usable hosts', 'ok'),
          line('Scope / Class  : ' + sub.scope + ' · ' + sub.ipClass, 'info'),
          line('Binary IP      : ' + sub.binaryIp, 'dim'),
          line('Binary Mask    : ' + sub.binaryMask, 'dim')
        ];

        var table = null;
        var sp = String(values.split_prefix || '').trim();
        if (sp) {
          var splitRes = IP.splitSubnets(sub.cidr, sp, 256);
          out.push(line('', 'info'));
          out.push(line('--- Split into /' + splitRes.targetPrefix + ' (' + splitRes.totalSubnets + ' subnets' + (splitRes.truncated ? ', showing first 256' : '') + ') ---', 'accent'));
          var rows = splitRes.subnets.map(function (c, i) {
            if (i < 16) out.push(line('  #' + pad(i + 1, 4) + pad(c.cidr, 20) + c.firstHost + ' - ' + c.lastHost + '  (bcast ' + c.broadcast + ')', 'info'));
            return [i + 1, c.cidr, c.firstHost + ' - ' + c.lastHost, c.broadcast, c.usableHosts];
          });
          if (splitRes.subnets.length > 16) out.push(line('  ... switch to Table view to inspect all ' + splitRes.subnets.length + ' rows.', 'dim'));
          table = { columns: ['#', 'Subnet CIDR', 'Usable Host Range', 'Broadcast', 'Usable'], rows: rows };
        }

        return Promise.resolve({
          ok: true,
          statusBadge: sub.cidr + ' (' + sub.usableHosts + ' hosts)',
          modeUsed: 'Offline Deterministic Math',
          kpis: [
            { k: 'Network', v: sub.network + '/' + sub.prefix },
            { k: 'Netmask', v: sub.netmask },
            { k: 'Broadcast', v: sub.broadcast },
            { k: 'Usable Hosts', v: sub.usableHosts.toLocaleString() }
          ],
          terminalLines: out,
          structuredTable: table,
          rawExport: out.map(function (x) { return x.text; }).join('\n')
        });
      }
    },

    {
      id: 'cidr-calc',
      category: 'ip-info',
      name: 'CIDR Calculator & Overlap Checker',
      mode: 'offline',
      requiresAuth: false,
      shortDesc: 'Inspect CIDR boundaries, test IP membership, and detect block overlaps',
      description: 'Validates CIDR blocks, optionally checks if an IP lies inside the CIDR, and checks whether two CIDR blocks overlap.',
      fields: [
        { key: 'cidr', label: 'Primary CIDR Block', type: 'text', defaultValue: '10.10.0.0/16', placeholder: 'e.g. 10.10.0.0/16' },
        { key: 'test_ip', label: 'Check IP Membership (optional)', type: 'text', defaultValue: '10.10.42.7', placeholder: 'e.g. 10.10.42.7' },
        { key: 'other_cidr', label: 'Compare Overlap With CIDR (optional)', type: 'text', defaultValue: '10.10.32.0/20', placeholder: 'e.g. 10.10.32.0/20' }
      ],
      examples: [
        { label: 'VPC Overlap Check', values: { cidr: '10.10.0.0/16', test_ip: '10.10.42.7', other_cidr: '10.10.32.0/20' }, note: 'Detects containment & overlap' }
      ],
      flagsGuide: [
        'Prevents VPC peering / routing table conflicts by verifying CIDR disjointness.'
      ],
      execute: function (values) {
        var c1 = V.validateCIDR(values.cidr);
        if (!c1.ok) return Promise.reject(new Error(c1.error));
        if (c1.version !== 4) return Promise.reject(new Error('CIDR overlap comparison currently supports IPv4 CIDRs.'));
        var sub = IP.calculateSubnet(c1.value);
        var out = [
          line('=== CIDR Block Analysis: ' + sub.cidr + ' ===', 'head'),
          line('Range          : ' + sub.network + ' — ' + sub.broadcast, 'ok'),
          line('Mask / Wildcard: ' + sub.netmask + ' / ' + sub.wildcard, 'info'),
          line('Addresses      : ' + sub.totalAddresses.toLocaleString() + ' total (' + sub.usableHosts.toLocaleString() + ' usable)', 'cyan')
        ];

        var membership = 'N/A';
        if (String(values.test_ip || '').trim()) {
          var ir = V.validateIPv4(values.test_ip);
          if (!ir.ok) return Promise.reject(new Error('Test IP: ' + ir.error));
          var inside = IP.cidrContainsIp(sub.cidr, ir.value);
          membership = inside ? 'CONTAINED' : 'OUTSIDE';
          out.push(line('IP Check       : ' + ir.value + ' is ' + (inside ? 'INSIDE ' : 'OUTSIDE ') + sub.cidr, inside ? 'ok' : 'warn'));
        }

        var overlap = 'N/A';
        if (String(values.other_cidr || '').trim()) {
          var c2 = V.validateCIDR(values.other_cidr);
          if (!c2.ok || c2.version !== 4) return Promise.reject(new Error('Second CIDR must be valid IPv4 CIDR.'));
          var doesOverlap = IP.cidrsOverlap(sub.cidr, c2.value);
          overlap = doesOverlap ? 'OVERLAPS' : 'DISJOINT';
          out.push(line('Overlap Check  : ' + sub.cidr + ' and ' + c2.value + ' -> ' + overlap, doesOverlap ? 'warn' : 'ok'));
        }

        return Promise.resolve({
          ok: true,
          statusBadge: sub.cidr + (overlap !== 'N/A' ? ' · ' + overlap : ''),
          modeUsed: 'Offline Deterministic Math',
          kpis: [
            { k: 'Block', v: sub.cidr },
            { k: 'Addresses', v: sub.totalAddresses.toLocaleString() },
            { k: 'IP Check', v: membership },
            { k: 'Overlap', v: overlap }
          ],
          terminalLines: out,
          rawExport: out.map(function (x) { return x.text; }).join('\n')
        });
      }
    },

    {
      id: 'ip-range-calc',
      category: 'ip-info',
      name: 'IP Range Calculator',
      mode: 'offline',
      requiresAuth: false,
      shortDesc: 'Convert any Start–End IPv4 range into exact minimal CIDR prefixes',
      description: 'Computes exact address count and aggregates an arbitrary IPv4 range [Start, End] into the minimal set of aligned CIDR blocks.',
      fields: [
        { key: 'start', label: 'Start IPv4 Address', type: 'text', defaultValue: '192.168.1.0', placeholder: 'e.g. 192.168.1.0' },
        { key: 'end', label: 'End IPv4 Address', type: 'text', defaultValue: '192.168.3.255', placeholder: 'e.g. 192.168.3.255' }
      ],
      examples: [
        { label: '3x /24 Block', values: { start: '192.168.1.0', end: '192.168.3.255' }, note: 'Aggregates into /24 + /23' },
        { label: 'Non-Aligned Range', values: { start: '10.0.0.10', end: '10.0.0.99' }, note: 'Exact ACL CIDR decomposition' }
      ],
      flagsGuide: [
        'Ideal for converting firewall/DHCP IP pools into AWS Security Group or ACL CIDR rules.'
      ],
      execute: function (values) {
        var s = V.validateIPv4(values.start);
        if (!s.ok) return Promise.reject(new Error('Start IP: ' + s.error));
        var e = V.validateIPv4(values.end);
        if (!e.ok) return Promise.reject(new Error('End IP: ' + e.error));
        var res = IP.calculateIpRange(s.value, e.value);
        var out = [
          line('=== IPv4 Range & CIDR Aggregation ===', 'head'),
          line('Start IP        : ' + res.startIp + ' (' + res.startScope + ')', 'info'),
          line('End IP          : ' + res.endIp + ' (' + res.endScope + ')', 'info'),
          line('Total Addresses : ' + res.totalAddresses.toLocaleString(), 'ok'),
          line('Minimal CIDRs   : ' + res.cidrCount + ' block(s)', 'accent'),
          line('', 'info')
        ];
        var rows = res.cidrs.map(function (c, i) {
          var sub = IP.calculateSubnet(c);
          out.push(line('  [' + (i + 1) + '] ' + pad(c, 20) + '(' + sub.totalAddresses.toLocaleString() + ' IPs: ' + sub.network + ' — ' + sub.broadcast + ')', 'cyan'));
          return [i + 1, c, sub.network, sub.broadcast, sub.totalAddresses];
        });
        return Promise.resolve({
          ok: true,
          statusBadge: res.cidrCount + ' CIDR(s) · ' + res.totalAddresses.toLocaleString() + ' IPs',
          modeUsed: 'Offline Deterministic Math',
          kpis: [
            { k: 'Start', v: res.startIp },
            { k: 'End', v: res.endIp },
            { k: 'Total IPs', v: res.totalAddresses.toLocaleString() },
            { k: 'CIDR Blocks', v: String(res.cidrCount) }
          ],
          terminalLines: out,
          structuredTable: { columns: ['#', 'CIDR', 'Network', 'Broadcast', 'Addresses'], rows: rows },
          rawExport: out.map(function (x) { return x.text; }).join('\n')
        });
      }
    },

    // ---------- 4. NETWORK CONFIGURATION ----------
    makeLocalOsTool({
      id: 'ipconfig',
      agentTool: 'ipconfig',
      category: 'net-config',
      name: 'IPConfig',
      shortDesc: 'Display local IPv4/IPv6 addresses, DHCP, gateway & DNS servers',
      description: 'Inspects Windows ipconfig (/all) or Linux/macOS equivalent interface IP configuration.',
      browserLimit: 'Browsers cannot enumerate local NICs, DHCP leases, gateways, or DNS server bindings.',
      fields: [
        { key: 'all', label: 'Detailed Output (/all)', type: 'checkbox', defaultValue: true }
      ],
      flagsGuide: ['Windows: ipconfig /all · Linux: ip addr show · macOS: ifconfig -a']
    }),

    makeLocalOsTool({
      id: 'ifconfig',
      agentTool: 'ifconfig',
      category: 'net-config',
      name: 'IfConfig',
      shortDesc: 'Inspect POSIX interface flags, MTU, MAC address & IP bindings',
      description: 'Runs ifconfig -a on Linux/macOS (or ipconfig /all equivalent on Windows) via Local Agent.',
      browserLimit: 'Local interface hardware & IP state is isolated from browser JavaScript.',
      fields: [],
      flagsGuide: ['Shows UP/BROADCAST/RUNNING flags, MTU, ether MAC, and inet/inet6 bindings.']
    }),

    makeLocalOsTool({
      id: 'hostname',
      agentTool: 'hostname',
      category: 'net-config',
      name: 'Hostname',
      shortDesc: 'Query the local machine hostname (and FQDN on Linux)',
      description: 'Returns the operating system host name via the Spid3r Local Companion Agent.',
      browserLimit: 'Browsers do not expose the local machine hostname for privacy.',
      fields: [
        { key: 'fqdn', label: 'Include FQDN (Linux -f)', type: 'checkbox', defaultValue: false }
      ],
      flagsGuide: ['Useful to verify which host a Local Agent session is running on.']
    }),

    makeLocalOsTool({
      id: 'arp-table',
      agentTool: 'arp-table'.replace('arp-table', 'arp'),
      category: 'net-config',
      name: 'ARP Table',
      shortDesc: 'Inspect local Layer-2 IP-to-MAC Neighbor / ARP cache',
      description: 'Displays cached IPv4-to-MAC address mappings learned on local Ethernet/Wi-Fi segments.',
      browserLimit: 'Browsers have no access to the OS kernel ARP/Neighbor table.',
      fields: [],
      flagsGuide: ['Windows: arp -a · Linux: ip neighbor show · macOS: arp -an']
    }),

    makeLocalOsTool({
      id: 'routing-table',
      agentTool: 'route',
      category: 'net-config',
      name: 'Routing Table',
      shortDesc: 'View kernel IP forwarding routes, default gateways & metrics',
      description: 'Displays active OS routing table entries via Local Companion Agent.',
      browserLimit: 'Browsers cannot inspect OS kernel routing tables.',
      fields: [],
      flagsGuide: ['0.0.0.0/0 (or default) shows the active default gateway and interface metric.']
    }),

    makeLocalOsTool({
      id: 'network-interfaces',
      agentTool: 'interfaces',
      category: 'net-config',
      name: 'Network Interface Info',
      shortDesc: 'List physical & virtual adapters, link status, MTU & indexes',
      description: 'Enumerates host NICs using netsh/ip/netstat -i via the Spid3r Local Companion Agent.',
      browserLimit: 'OS adapter enumeration is blocked in browser sandboxes (navigator.connection only reports coarse downlink estimates).',
      fields: [],
      flagsGuide: ['Shows connected vs disconnected adapters, loopback, VPN tunnels, and virtual bridges.']
    }),

    // ---------- 5. CONNECTION MONITORING ----------
    makeLocalOsTool({
      id: 'netstat',
      agentTool: 'netstat',
      category: 'conn-mon',
      name: 'Netstat',
      shortDesc: 'Display active TCP/UDP sockets, listening ports & owning PIDs',
      description: 'Runs netstat -ano (Windows), ss -tulnap (Linux), or netstat -anv (macOS) via Local Companion Agent.',
      browserLimit: 'Browsers cannot inspect host-wide OS sockets or process IDs.',
      fields: [],
      flagsGuide: ['Check Foreign Address and PID columns to trace unexpected outbound connections.']
    }),

    makeLocalOsTool({
      id: 'tcp-udp-viewer',
      agentTool: 'connections',
      category: 'conn-mon',
      name: 'TCP / UDP Connection Viewer',
      shortDesc: 'Inspect live TCP state machine & UDP socket endpoints',
      description: 'Lists active TCP/UDP endpoints across LISTEN, ESTABLISHED, SYN_SENT, and TIME_WAIT states.',
      browserLimit: 'Socket table inspection requires OS privileges via Local Companion Agent or terminal.',
      fields: [],
      flagsGuide: ['High TIME_WAIT counts can indicate ephemeral port churn on busy servers.']
    }),

    makeLocalOsTool({
      id: 'open-ports',
      agentTool: 'open_ports',
      category: 'conn-mon',
      name: 'Local Open Ports Checker',
      shortDesc: 'Audit listening TCP/UDP ports bound on local host interfaces',
      description: 'Audits services currently bound in LISTENING state on 127.0.0.1 or 0.0.0.0.',
      browserLimit: 'Local listening-socket audit requires Local Companion Agent or host terminal.',
      fields: [],
      flagsGuide: ['Verify internal services bind to 127.0.0.1 rather than 0.0.0.0 when not meant to be public.']
    }),

    makeLocalOsTool({
      id: 'network-stats',
      agentTool: 'net_stats',
      category: 'conn-mon',
      name: 'Network Statistics',
      shortDesc: 'Inspect Ethernet, IP, TCP, UDP & ICMP protocol counters',
      description: 'Reports OS interface packet/byte counters, retransmissions, and protocol errors.',
      browserLimit: 'Kernel protocol MIB counters are unavailable in browser JavaScript.',
      fields: [],
      flagsGuide: ['Watch TCP Segments Retransmitted and InErrors for link congestion or hardware faults.']
    }),

    // ---------- 6. WEB & HTTP DIAGNOSTICS ----------
    {
      id: 'curl',
      category: 'web-http',
      name: 'cURL HTTP Client',
      mode: 'hybrid',
      requiresAuth: true,
      shortDesc: 'Execute custom HTTP/HTTPS requests with method, headers & body',
      description: 'Executes HTTP requests via Spid3r Local Agent (unrestricted) or browser fetch() (subject to target CORS policy).',
      fields: [
        { key: 'url', label: 'Target URL', type: 'text', defaultValue: 'https://api64.ipify.org?format=json', placeholder: 'https://example.com/api' },
        {
          key: 'method', label: 'HTTP Method', type: 'select', defaultValue: 'GET',
          options: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].map(function (m) { return { value: m, label: m }; })
        },
        { key: 'headers', label: 'Custom Headers (Key: Value per line)', type: 'textarea', defaultValue: 'Accept: application/json', placeholder: 'Accept: application/json' },
        { key: 'body', label: 'Request Body (POST/PUT/PATCH)', type: 'textarea', defaultValue: '', placeholder: '{"hello":"spid3r"}' }
      ],
      examples: [
        { label: 'CORS JSON API', values: { url: 'https://api64.ipify.org?format=json', method: 'GET', headers: 'Accept: application/json', body: '' }, note: 'Works natively in browser' },
        { label: 'RDAP Lookup', values: { url: 'https://rdap.org/domain/example.com', method: 'GET', headers: 'Accept: application/rdap+json', body: '' }, note: 'Inspect JSON response & headers' }
      ],
      flagsGuide: [
        'Browser mode reads status, headers, and body when the server returns Access-Control-Allow-Origin.',
        'Connect the Spid3r Local Companion Agent to inspect any URL regardless of CORS.'
      ],
      execute: function (values, ctx) {
        var authErr = checkAuth(values, this);
        if (authErr) return Promise.reject(new Error(authErr));
        var ur = V.validateUrl(values.url);
        if (!ur.ok) return Promise.reject(new Error(ur.error));
        var hdrMap = {};
        String(values.headers || '').split(/\r?\n/).forEach(function (l) {
          var idx = l.indexOf(':');
          if (idx > 0) {
            var k = l.slice(0, idx).trim();
            var val = l.slice(idx + 1).trim();
            if (k) hdrMap[k] = val;
          }
        });
        var method = String(values.method || 'GET').toUpperCase();

        if (agentAvailable(ctx)) {
          return API.runAgentTool('curl', { method: method, url: ur.value, headers: hdrMap, body: values.body || null }, true, ctx.signal).then(function (res) {
            var d = res.data || {};
            var out = [
              line('=== cURL Response (Spid3r Local Agent) ===', 'head'),
              line(method + ' ' + ur.value, 'cyan'),
              line('Status   : HTTP ' + d.status + '  (' + (d.duration_ms || 0) + ' ms)', d.status >= 200 && d.status < 400 ? 'ok' : 'warn'),
              line('', 'info'),
              line('--- Response Headers ---', 'accent')
            ];
            var hObj = d.headers || {};
            Object.keys(hObj).sort().forEach(function (k) {
              out.push(line('  ' + k + ': ' + hObj[k], 'info'));
            });
            out.push(line('', 'info'));
            out.push(line('--- Response Body ---', 'accent'));
            out = out.concat(linesFromText((d.body || '(empty)').slice(0, 12000), 'info'));
            return {
              ok: d.status >= 200 && d.status < 400,
              statusBadge: 'HTTP ' + d.status + ' · ' + (d.duration_ms || 0) + ' ms',
              modeUsed: 'Spid3r Local Agent',
              kpis: [
                { k: 'Status', v: 'HTTP ' + d.status },
                { k: 'Duration', v: (d.duration_ms || 0) + ' ms' },
                { k: 'Headers', v: String(Object.keys(hObj).length) }
              ],
              terminalLines: out,
              rawExport: out.map(function (x) { return x.text; }).join('\n')
            };
          });
        }

        return API.probeHttpOnce({
          url: ur.value,
          method: method,
          headers: hdrMap,
          body: values.body || undefined,
          allowOpaqueFallback: false,
          timeoutMs: 10000
        }, ctx.signal).then(function (r) {
          var out = [
            line('=== Browser Fetch Response ===', 'head'),
            line(method + ' ' + r.finalUrl, 'cyan'),
            line('Status   : HTTP ' + r.status + ' ' + r.statusText + (r.redirected ? ' (redirected)' : ''), r.status >= 200 && r.status < 400 ? 'ok' : 'warn'),
            line('Timing   : TTFB ' + r.ttfbMs + ' ms · Total ' + r.totalMs + ' ms · Size ' + r.bytes + ' chars', 'dim'),
            line('', 'info'),
            line('--- CORS-Exposed Headers ---', 'accent')
          ];
          var hKeys = Object.keys(r.headers).sort();
          if (!hKeys.length) out.push(line('  (none exposed beyond CORS safelist)', 'dim'));
          hKeys.forEach(function (k) { out.push(line('  ' + k + ': ' + r.headers[k], 'info')); });
          out.push(line('', 'info'));
          out.push(line('--- Body Preview ---', 'accent'));
          var bodyTxt = r.body || '(empty)';
          if (bodyTxt.length > 12000) bodyTxt = bodyTxt.slice(0, 12000) + '\n... [truncated at 12,000 chars]';
          out = out.concat(linesFromText(bodyTxt, 'info'));
          return {
            ok: r.status >= 200 && r.status < 400,
            statusBadge: 'HTTP ' + r.status + ' · ' + r.totalMs + ' ms',
            modeUsed: 'Browser Fetch (CORS)',
            kpis: [
              { k: 'Status', v: 'HTTP ' + r.status },
              { k: 'TTFB', v: r.ttfbMs + ' ms' },
              { k: 'Total', v: r.totalMs + ' ms' },
              { k: 'Body Size', v: r.bytes + ' B' }
            ],
            terminalLines: out,
            rawExport: out.map(function (x) { return x.text; }).join('\n')
          };
        }).catch(function (err) {
          var cmds = CMD.build('curl', values);
          var out = [
            line('=== Browser cURL Blocked by CORS / Network ===', 'head'),
            line('Error: ' + err.message, 'err'),
            line('Remote servers without Access-Control-Allow-Origin prevent browser scripts from reading responses.', 'warn'),
            line('', 'info'),
            line('Run in Local Agent or Terminal:', 'accent'),
            line('  ' + cmds.linux, 'ok')
          ];
          return {
            ok: false,
            statusBadge: 'CORS / Fetch Error',
            modeUsed: 'Browser Fetch',
            terminalLines: out,
            rawExport: out.map(function (x) { return x.text; }).join('\n')
          };
        });
      }
    },

    {
      id: 'http-headers',
      category: 'web-http',
      name: 'HTTP Header & Security Audit',
      mode: 'hybrid',
      requiresAuth: true,
      shortDesc: 'Inspect response headers and evaluate HSTS, CSP, Frame & MIME security',
      description: 'Fetches response headers and scores common HTTP security headers. Uses Spid3r Local Agent when connected for unrestricted full-header inspection.',
      fields: [
        { key: 'url', label: 'Target URL', type: 'text', defaultValue: 'https://cloudflare-dns.com/dns-query?name=example.com&type=A', placeholder: 'https://example.com' }
      ],
      examples: [
        { label: 'Cloudflare DoH Headers', values: { url: 'https://cloudflare-dns.com/dns-query?name=example.com&type=A' }, note: 'CORS-enabled endpoint' },
        { label: 'spid3r-spkg.github.io', values: { url: 'https://spid3r-spkg.github.io/' }, note: 'GitHub Pages headers' }
      ],
      flagsGuide: [
        'Browsers only see CORS-safelisted + Access-Control-Expose-Headers unless Local Agent is connected.'
      ],
      execute: function (values, ctx) {
        var authErr = checkAuth(values, this);
        if (authErr) return Promise.reject(new Error(authErr));
        var ur = V.validateUrl(values.url);
        if (!ur.ok) return Promise.reject(new Error(ur.error));

        var secKeys = [
          'strict-transport-security',
          'content-security-policy',
          'x-content-type-options',
          'x-frame-options',
          'referrer-policy',
          'permissions-policy',
          'cache-control'
        ];

        function buildAudit(status, hdrs, modeLabel, ms) {
          var norm = {};
          Object.keys(hdrs || {}).forEach(function (k) { norm[k.toLowerCase()] = hdrs[k]; });
          var out = [
            line('=== HTTP Header & Security Audit ===', 'head'),
            line('URL    : ' + ur.value, 'cyan'),
            line('Status : HTTP ' + status + ' (' + ms + ' ms)', 'ok'),
            line('', 'info'),
            line('--- Security Header Checklist ---', 'accent')
          ];
          var present = 0;
          var rows = [];
          secKeys.forEach(function (k) {
            var val = norm[k];
            if (val) present += 1;
            rows.push([k, val ? 'PRESENT' : 'MISSING / HIDDEN', val || '—']);
            out.push(line('  [' + (val ? 'OK  ' : 'MISS') + '] ' + pad(k, 28) + (val || '—'), val ? 'ok' : 'warn'));
          });
          out.push(line('', 'info'));
          out.push(line('--- All Visible Headers ---', 'accent'));
          Object.keys(norm).sort().forEach(function (k) {
            out.push(line('  ' + k + ': ' + norm[k], 'info'));
          });
          return {
            ok: true,
            statusBadge: 'HTTP ' + status + ' · ' + present + '/' + secKeys.length + ' Sec Headers',
            modeUsed: modeLabel,
            kpis: [
              { k: 'HTTP Status', v: String(status) },
              { k: 'Visible Headers', v: String(Object.keys(norm).length) },
              { k: 'Sec Score', v: present + '/' + secKeys.length }
            ],
            terminalLines: out,
            structuredTable: { columns: ['Header', 'Audit', 'Value'], rows: rows },
            rawExport: out.map(function (x) { return x.text; }).join('\n')
          };
        }

        if (agentAvailable(ctx)) {
          return API.runAgentTool('http_headers', { method: 'HEAD', url: ur.value }, true, ctx.signal).then(function (res) {
            var d = res.data || {};
            return buildAudit(d.status, d.headers, 'Spid3r Local Agent', d.duration_ms || 0);
          });
        }
        return API.probeHttpOnce({ url: ur.value, method: 'GET', allowOpaqueFallback: false, timeoutMs: 9000 }, ctx.signal).then(function (r) {
          return buildAudit(r.status, r.headers, 'Browser Fetch (CORS-Visible)', r.totalMs);
        }).catch(function (err) {
          return {
            ok: false,
            statusBadge: 'CORS Blocked',
            modeUsed: 'Browser Fetch',
            terminalLines: [
              line('=== HTTP Header Audit Blocked by CORS ===', 'head'),
              line('Error: ' + err.message, 'err'),
              line('Run with Local Agent or: ' + CMD.build('http-headers', values).linux, 'ok')
            ],
            rawExport: err.message
          };
        });
      }
    },

    {
      id: 'http-status',
      category: 'web-http',
      name: 'HTTP Status Checker',
      mode: 'hybrid',
      requiresAuth: true,
      shortDesc: 'Verify HTTP status code, redirect chain & endpoint availability',
      description: 'Checks HTTP endpoint status code and reachability, falling back to opaque reachability timing if CORS forbids reading status.',
      fields: [
        { key: 'url', label: 'Target URL', type: 'text', defaultValue: 'https://example.com', placeholder: 'https://example.com' }
      ],
      examples: [
        { label: 'example.com', values: { url: 'https://example.com' }, note: 'Reachability & status check' },
        { label: 'rdap.org', values: { url: 'https://rdap.org/domain/example.com' }, note: 'Full HTTP 200 status' }
      ],
      flagsGuide: [
        '2xx = Success, 3xx = Redirection, 4xx = Client Error, 5xx = Server Error.'
      ],
      execute: function (values, ctx) {
        var authErr = checkAuth(values, this);
        if (authErr) return Promise.reject(new Error(authErr));
        var ur = V.validateUrl(values.url);
        if (!ur.ok) return Promise.reject(new Error(ur.error));

        if (agentAvailable(ctx)) {
          return API.runAgentTool('http_status', { method: 'HEAD', url: ur.value }, true, ctx.signal).then(function (res) {
            var d = res.data || {};
            var out = [
              line('=== HTTP Status Check (Spid3r Local Agent) ===', 'head'),
              line('URL    : ' + ur.value, 'cyan'),
              line('Status : HTTP ' + d.status, d.status < 400 ? 'ok' : 'warn'),
              line('Time   : ' + (d.duration_ms || 0) + ' ms', 'dim')
            ];
            return {
              ok: d.status < 400,
              statusBadge: 'HTTP ' + d.status,
              modeUsed: 'Spid3r Local Agent',
              kpis: [
                { k: 'Status', v: 'HTTP ' + d.status },
                { k: 'Latency', v: (d.duration_ms || 0) + ' ms' }
              ],
              terminalLines: out,
              rawExport: out.map(function (x) { return x.text; }).join('\n')
            };
          });
        }

        return API.probeHttpOnce({ url: ur.value, method: 'HEAD', allowOpaqueFallback: true, timeoutMs: 8000 }, ctx.signal).then(function (r) {
          var out = [
            line('=== HTTP Status Check ===', 'head'),
            line('URL       : ' + r.finalUrl, 'cyan'),
            line('Status    : ' + (r.opaque ? 'Reachable (CORS Opaque — status code hidden by browser)' : ('HTTP ' + r.status + ' ' + r.statusText)), r.opaque ? 'accent' : (r.status < 400 ? 'ok' : 'warn')),
            line('Redirected: ' + (r.redirected ? 'Yes' : 'No'), 'info'),
            line('Round-Trip: ' + r.totalMs + ' ms', 'dim')
          ];
          if (r.corsNote) out.push(line('Note: ' + r.corsNote, 'dim'));
          return {
            ok: true,
            statusBadge: r.opaque ? 'Reachable (Opaque)' : ('HTTP ' + r.status),
            modeUsed: r.opaque ? 'Browser Probe (Opaque)' : 'Browser Fetch (CORS)',
            kpis: [
              { k: 'Result', v: r.opaque ? 'Reachable' : ('HTTP ' + r.status) },
              { k: 'Mode', v: r.mode },
              { k: 'Latency', v: r.totalMs + ' ms' }
            ],
            terminalLines: out,
            rawExport: out.map(function (x) { return x.text; }).join('\n')
          };
        });
      }
    },

    {
      id: 'ssl-checker',
      category: 'web-http',
      name: 'SSL / TLS Certificate Checker',
      mode: 'live',
      requiresAuth: false,
      shortDesc: 'Inspect public CT certificate history, issuer, expiry & CAA records',
      description: 'Queries Certificate Transparency logs (crt.sh) and DNS CAA records to inspect issued TLS certificates, validity windows, and issuers; or runs openssl s_client via Local Agent.',
      fields: [
        { key: 'host', label: 'Domain / Hostname', type: 'text', defaultValue: 'example.com', placeholder: 'e.g. github.com' },
        { key: 'port', label: 'TLS Port (for Local Agent openssl)', type: 'number', defaultValue: 443, min: 1, max: 65535 }
      ],
      examples: [
        { label: 'example.com', values: { host: 'example.com', port: 443 }, note: 'CT logs + CAA check' },
        { label: 'spid3r-spkg.github.io', values: { host: 'spid3r-spkg.github.io', port: 443 }, note: 'GitHub Pages TLS certs' }
      ],
      flagsGuide: [
        'Browsers do not expose raw X.509 handshake certificates to JavaScript.',
        'CT log queries show real publicly logged certificates, issuers, SANs, and expiration dates.'
      ],
      execute: function (values, ctx) {
        var hr = V.validateHostname(values.host);
        if (!hr.ok) return Promise.reject(new Error(hr.error));
        var domain = hr.value.toLowerCase();

        return Promise.all([
          API.fetchCertsCt(domain, ctx.signal).catch(function (e) { return { error: e.message }; }),
          API.queryDoH(domain, 'CAA', 'cloudflare', {}, ctx.signal).catch(function () { return { answers: [] }; })
        ]).then(function (arr) {
          var ct = arr[0], caa = arr[1];
          var caaRecords = (caa.answers || []).filter(function (a) { return a.typeName === 'CAA'; });
          if (ct.error) {
            return {
              ok: false,
              statusBadge: 'CT Query Unavailable',
              modeUsed: 'crt.sh + DoH CAA',
              terminalLines: [
                line('=== SSL / TLS Certificate Checker: ' + domain + ' ===', 'head'),
                line('CT log query error: ' + ct.error, 'err'),
                line('CAA Records: ' + (caaRecords.length ? caaRecords.map(function (c) { return c.data; }).join('; ') : 'None'), 'info'),
                line('CLI check  : ' + CMD.build('ssl-checker', values).linux, 'ok')
              ],
              rawExport: ct.error
            };
          }

          var rawList = Array.isArray(ct.data) ? ct.data : [];
          var seen = {};
          var unique = [];
          rawList.sort(function (a, b) { return (b.id || 0) - (a.id || 0); }).forEach(function (c) {
            var key = (c.serial_number || '') + '|' + (c.not_after || '');
            if (!seen[key]) {
              seen[key] = true;
              unique.push(c);
            }
          });

          var now = Date.now();
          var top = unique.slice(0, 12);
          var rows = [];
          var out = [
            line('=== SSL/TLS Certificate Transparency Report: ' + domain + ' ===', 'head'),
            line('CAA Policy : ' + (caaRecords.length ? caaRecords.map(function (x) { return x.data; }).join(' | ') : 'None published'), 'cyan'),
            line('Certs Found: ' + unique.length + ' unique CT entries (showing latest ' + top.length + ')', 'info'),
            line('', 'info')
          ];
          var activeCount = 0;
          top.forEach(function (c) {
            var expMs = Date.parse(c.not_after);
            var daysLeft = isNaN(expMs) ? null : Math.ceil((expMs - now) / 86400000);
            var status = daysLeft === null ? 'UNKNOWN' : (daysLeft < 0 ? 'EXPIRED' : (daysLeft <= 14 ? 'EXPIRING (' + daysLeft + 'd)' : 'VALID (' + daysLeft + 'd)'));
            if (daysLeft !== null && daysLeft >= 0) activeCount += 1;
            var issuerCn = (String(c.issuer_name || '').match(/CN=([^,]+)/) || [])[1] || String(c.issuer_name || '').slice(0, 40);
            var cn = String(c.common_name || c.name_value || '').split('\n')[0];
            rows.push([cn, issuerCn, String(c.not_before || '').slice(0, 10), String(c.not_after || '').slice(0, 10), status]);
            out.push(line('  [' + pad(status, 15).trim() + '] CN=' + pad(cn, 28) + ' Issuer=' + pad(issuerCn, 30) + ' Exp=' + String(c.not_after || '').slice(0, 10), daysLeft >= 0 ? 'ok' : 'dim'));
          });

          return {
            ok: true,
            statusBadge: activeCount + ' Active Cert(s) in CT',
            modeUsed: 'crt.sh CT + DoH CAA',
            kpis: [
              { k: 'Domain', v: domain },
              { k: 'Unique CT Certs', v: String(unique.length) },
              { k: 'Active (Top 12)', v: String(activeCount) },
              { k: 'CAA Records', v: String(caaRecords.length) }
            ],
            terminalLines: out,
            structuredTable: { columns: ['Common Name', 'Issuer', 'Not Before', 'Not After', 'Status'], rows: rows },
            rawExport: out.map(function (x) { return x.text; }).join('\n')
          };
        });
      }
    },

    {
      id: 'response-time',
      category: 'web-http',
      name: 'Website Response Time Checker',
      mode: 'live',
      requiresAuth: true,
      shortDesc: 'Multi-sample HTTP/HTTPS latency, jitter & percentile benchmark',
      description: 'Performs N uncached sequential timing probes to measure min, median, average, p95, max, and jitter from your current network.',
      fields: [
        { key: 'url', label: 'Target URL', type: 'text', defaultValue: 'https://cloudflare-dns.com/dns-query?name=example.com&type=A', placeholder: 'https://example.com' },
        { key: 'samples', label: 'Sample Count (2–10)', type: 'number', defaultValue: 5, min: 2, max: 10 }
      ],
      examples: [
        { label: 'Cloudflare DoH', values: { url: 'https://cloudflare-dns.com/dns-query?name=example.com&type=A', samples: 5 }, note: '5-sample CDN latency' },
        { label: 'spid3r-spkg.github.io', values: { url: 'https://spid3r-spkg.github.io/catalog.txt', samples: 5 }, note: 'Registry response time' }
      ],
      flagsGuide: [
        'First sample includes cold DNS/TLS setup; subsequent samples often reuse warm connections.',
        'Includes jitter (mean absolute deviation between consecutive samples).'
      ],
      execute: function (values, ctx) {
        var authErr = checkAuth(values, this);
        if (authErr) return Promise.reject(new Error(authErr));
        var ur = V.validateUrl(values.url);
        if (!ur.ok) return Promise.reject(new Error(ur.error));
        var count = V.clampInt(values.samples, 2, 10, 5);
        var times = [];
        var rows = [];
        var out = [line('=== Website Response Time Benchmark (' + count + ' samples): ' + ur.value + ' ===', 'head')];
        var chain = Promise.resolve();
        for (var i = 0; i < count; i++) {
          (function (idx) {
            chain = chain.then(function () {
              return API.probeHttpOnce({ url: ur.value, method: 'GET', allowOpaqueFallback: true, timeoutMs: 8000 }, ctx.signal).then(function (r) {
                times.push(r.totalMs);
                var bar = new Array(Math.max(1, Math.min(30, Math.round(r.totalMs / 15))) + 1).join('#');
                rows.push([idx + 1, r.opaque ? 'Opaque' : ('HTTP ' + r.status), r.totalMs]);
                out.push(line('  Sample #' + pad(idx + 1, 3) + pad((r.opaque ? 'Opaque' : 'HTTP ' + r.status), 10) + pad(r.totalMs + ' ms', 9) + bar, 'ok'));
              }).catch(function (e) {
                rows.push([idx + 1, 'ERROR', e.message]);
                out.push(line('  Sample #' + pad(idx + 1, 3) + 'ERR: ' + e.message, 'err'));
              });
            });
          })(i);
        }
        return chain.then(function () {
          if (!times.length) throw new Error('All response-time samples failed.');
          var sorted = times.slice().sort(function (a, b) { return a - b; });
          var min = sorted[0], max = sorted[sorted.length - 1];
          var avg = Math.round(times.reduce(function (a, b) { return a + b; }, 0) / times.length);
          var med = sorted[Math.floor(sorted.length / 2)];
          var p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
          var jitSum = 0;
          for (var j = 1; j < times.length; j++) jitSum += Math.abs(times[j] - times[j - 1]);
          var jitter = times.length > 1 ? Math.round(jitSum / (times.length - 1)) : 0;
          out.push(line('', 'info'));
          out.push(line('Stats: min=' + min + 'ms  median=' + med + 'ms  avg=' + avg + 'ms  p95=' + p95 + 'ms  max=' + max + 'ms  jitter=' + jitter + 'ms', 'accent'));
          return {
            ok: true,
            statusBadge: med + ' ms median (' + min + '–' + max + ' ms)',
            modeUsed: 'Multi-Sample HTTP Probe',
            kpis: [
              { k: 'Median', v: med + ' ms' },
              { k: 'Average', v: avg + ' ms' },
              { k: 'P95 / Max', v: p95 + ' / ' + max + ' ms' },
              { k: 'Jitter', v: jitter + ' ms' }
            ],
            terminalLines: out,
            structuredTable: { columns: ['Sample', 'Status', 'Elapsed (ms)'], rows: rows },
            rawExport: out.map(function (x) { return x.text; }).join('\n')
          };
        });
      }
    },

    // ---------- 7. DOMAIN & INFRASTRUCTURE ----------
    {
      id: 'whois',
      category: 'domain-infra',
      name: 'WHOIS / RDAP Lookup',
      mode: 'live',
      requiresAuth: false,
      shortDesc: 'Query registration, registrar, dates, EPP statuses & contacts via RDAP',
      description: 'Queries authoritative RDAP (Registration Data Access Protocol) registries for domains, IP addresses, or ASNs — the standardized HTTPS JSON successor to port-43 WHOIS.',
      fields: [
        { key: 'query', label: 'Domain, IP, or ASN', type: 'text', defaultValue: 'example.com', placeholder: 'e.g. example.com, 8.8.8.8, or AS13335' }
      ],
      examples: [
        { label: 'Domain RDAP', values: { query: 'example.com' }, note: 'Registrar, dates & EPP status' },
        { label: 'IP RDAP', values: { query: '8.8.8.8' }, note: 'ARIN IP block ownership' },
        { label: 'ASN RDAP', values: { query: 'AS13335' }, note: 'Cloudflare ASN registration' }
      ],
      flagsGuide: [
        'RDAP returns structured JSON over HTTPS with CORS (unlike legacy TCP port 43 WHOIS).',
        'Connect Local Agent to run native OS "whois" if installed.'
      ],
      execute: function (values, ctx) {
        var q = String(values.query || '').trim();
        var kind = 'domain';
        var cleanQ = q;
        if (V.validateIP(q).ok) {
          kind = 'ip';
        } else if (V.validateASN(q).ok) {
          kind = 'autnum';
          cleanQ = String(V.validateASN(q).number);
        } else {
          var hr = V.validateHostname(q);
          if (!hr.ok) return Promise.reject(new Error('Enter a valid domain, IP address, or ASN.'));
          cleanQ = hr.value.toLowerCase();
        }

        return API.fetchRdap(kind, cleanQ, ctx.signal).then(function (res) {
          var d = res.data || {};
          var sum = extractRdapSummary(d, cleanQ);
          var out = [
            line('=== RDAP / WHOIS Registration Record (' + kind.toUpperCase() + ': ' + cleanQ + ') ===', 'head'),
            line('Name / Handle : ' + sum.ldhName + '  [' + sum.handle + ']', 'ok'),
            line('Registrar/Org : ' + sum.registrar, 'cyan'),
            line('Registered    : ' + sum.created, 'info'),
            line('Last Updated  : ' + sum.updated, 'info'),
            line('Expires       : ' + sum.expires, 'accent'),
            line('DNSSEC        : ' + sum.dnssec, 'info'),
            line('Status Flags  : ' + (sum.status.length ? sum.status.join(', ') : '—'), 'dim'),
            line('Nameservers   : ' + (sum.nameservers.length ? sum.nameservers.join(', ') : '—'), 'info')
          ];
          if (d.startAddress && d.endAddress) {
            out.push(line('IP Range      : ' + d.startAddress + ' — ' + d.endAddress + ' (' + (d.country || '') + ')', 'ok'));
          }
          return {
            ok: true,
            statusBadge: sum.ldhName + ' (' + res.elapsedMs + ' ms)',
            modeUsed: 'Live RDAP (rdap.org)',
            kpis: [
              { k: 'Object', v: sum.ldhName },
              { k: 'Registrar', v: sum.registrar },
              { k: 'Expires', v: String(sum.expires).slice(0, 10) },
              { k: 'DNSSEC', v: sum.dnssec }
            ],
            terminalLines: out,
            rawExport: out.map(function (x) { return x.text; }).join('\n')
          };
        });
      }
    },

    {
      id: 'domain-info',
      category: 'domain-infra',
      name: 'Domain Intelligence Summary',
      mode: 'live',
      requiresAuth: false,
      shortDesc: 'Combined RDAP lifecycle + NS, A/AAAA, MX & CAA posture dashboard',
      description: 'Combines RDAP domain registration status with live DoH queries for nameservers, IPv4/IPv6 addresses, mail exchangers, and CAA records.',
      fields: [
        { key: 'domain', label: 'Domain Name', type: 'text', defaultValue: 'github.com', placeholder: 'e.g. github.com' }
      ],
      examples: [
        { label: 'github.com', values: { domain: 'github.com' }, note: 'Full lifecycle + DNS profile' },
        { label: 'example.com', values: { domain: 'example.com' }, note: 'IANA reserved test domain' }
      ],
      flagsGuide: [
        'Ideal pre-flight check before renewals, migrations, or DNS cutovers.'
      ],
      execute: function (values, ctx) {
        var hr = V.validateHostname(values.domain);
        if (!hr.ok) return Promise.reject(new Error(hr.error));
        var dom = hr.value.toLowerCase();
        return Promise.all([
          API.fetchRdap('domain', dom, ctx.signal).catch(function () { return null; }),
          API.queryDoH(dom, 'A', 'cloudflare', {}, ctx.signal).catch(function () { return { answers: [] }; }),
          API.queryDoH(dom, 'AAAA', 'cloudflare', {}, ctx.signal).catch(function () { return { answers: [] }; }),
          API.queryDoH(dom, 'NS', 'cloudflare', {}, ctx.signal).catch(function () { return { answers: [] }; }),
          API.queryDoH(dom, 'MX', 'cloudflare', {}, ctx.signal).catch(function () { return { answers: [] }; })
        ]).then(function (arr) {
          var rdap = arr[0] ? extractRdapSummary(arr[0].data || {}, dom) : null;
          var aRecs = arr[1].answers.filter(function (a) { return a.typeName === 'A'; }).map(function (a) { return a.data; });
          var aaaaRecs = arr[2].answers.filter(function (a) { return a.typeName === 'AAAA'; }).map(function (a) { return a.data; });
          var nsRecs = arr[3].answers.filter(function (a) { return a.typeName === 'NS'; }).map(function (a) { return a.data; });
          var mxRecs = arr[4].answers.filter(function (a) { return a.typeName === 'MX'; }).map(function (a) { return a.data; });

          var out = [line('=== Domain Intelligence Summary: ' + dom + ' ===', 'head')];
          if (rdap) {
            out.push(line('Registrar : ' + rdap.registrar, 'cyan'));
            out.push(line('Created   : ' + rdap.created + '  |  Expires: ' + rdap.expires, 'info'));
            out.push(line('DNSSEC    : ' + rdap.dnssec + '  |  EPP: ' + (rdap.status.slice(0, 3).join(', ') || '—'), 'dim'));
          } else {
            out.push(line('RDAP data unavailable for this TLD.', 'warn'));
          }
          out.push(line('', 'info'));
          out.push(line('A Records   : ' + (aRecs.join(', ') || 'None'), aRecs.length ? 'ok' : 'dim'));
          out.push(line('AAAA Records: ' + (aaaaRecs.join(', ') || 'None'), aaaaRecs.length ? 'ok' : 'dim'));
          out.push(line('Name Servers: ' + (nsRecs.join(', ') || 'None'), 'info'));
          out.push(line('MX Records  : ' + (mxRecs.join(', ') || 'None'), 'info'));

          return {
            ok: true,
            statusBadge: dom + ' · ' + aRecs.length + ' A / ' + nsRecs.length + ' NS',
            modeUsed: 'RDAP + Live DoH',
            kpis: [
              { k: 'Registrar', v: rdap ? rdap.registrar : 'Unknown' },
              { k: 'Expires', v: rdap ? String(rdap.expires).slice(0, 10) : '—' },
              { k: 'IPv4 (A)', v: aRecs[0] || 'None' },
              { k: 'NS Count', v: String(nsRecs.length) }
            ],
            terminalLines: out,
            rawExport: out.map(function (x) { return x.text; }).join('\n')
          };
        });
      }
    },

    {
      id: 'asn-lookup',
      category: 'domain-infra',
      name: 'ASN Lookup',
      mode: 'live',
      requiresAuth: false,
      shortDesc: 'Inspect Autonomous System holder, BGP prefixes & RIR allocation',
      description: 'Accepts an AS number (AS13335), IP address, or domain name and queries RIPEstat BGP routing data + RDAP.',
      fields: [
        { key: 'query', label: 'ASN, IP Address, or Hostname', type: 'text', defaultValue: 'AS13335', placeholder: 'e.g. AS13335, 1.1.1.1, or cloudflare.com' }
      ],
      examples: [
        { label: 'AS13335 (Cloudflare)', values: { query: 'AS13335' }, note: 'ASN holder & announced prefixes' },
        { label: '8.8.8.8 Origin ASN', values: { query: '8.8.8.8' }, note: 'Maps IP -> BGP prefix -> ASN' }
      ],
      flagsGuide: [
        'Queries RIPEstat as-overview, prefix-overview, announced-prefixes, and RDAP autnum.'
      ],
      execute: function (values, ctx) {
        var q = String(values.query || '').trim();
        var asnRes = V.validateASN(q);
        var resolveAsn;
        if (asnRes.ok) {
          resolveAsn = Promise.resolve({ asn: asnRes.value, via: 'direct' });
        } else {
          var hr = V.validateHostname(q);
          if (!hr.ok) return Promise.reject(new Error('Enter a valid ASN (AS13335), IP, or hostname.'));
          var ipRes = V.validateIP(hr.value);
          var getIp = ipRes.ok
            ? Promise.resolve(ipRes.value)
            : API.queryDoH(hr.value, 'A', 'cloudflare', {}, ctx.signal).then(function (r) {
              var a = r.answers.find(function (x) { return x.typeName === 'A'; });
              if (!a) throw new Error('No A record found for ' + hr.value);
              return a.data;
            });
          resolveAsn = getIp.then(function (ip) {
            return API.fetchIpPrefixRipe(ip, ctx.signal).then(function (pr) {
              var d = pr.data && pr.data.data ? pr.data.data : {};
              var asns = d.asns || [];
              if (!asns.length) throw new Error('No origin ASN found in BGP for ' + ip);
              return { asn: 'AS' + asns[0].asn, via: ip + ' (' + (d.resource || '') + ')', holder: asns[0].holder };
            });
          });
        }

        return resolveAsn.then(function (meta) {
          return API.fetchAsnRipe(meta.asn, ctx.signal).then(function (res) {
            var ov = res.overview || {};
            var prefs = res.prefixes && Array.isArray(res.prefixes.prefixes) ? res.prefixes.prefixes : [];
            var holder = ov.holder || meta.holder || (res.rdap && res.rdap.name) || 'Unknown';
            var out = [
              line('=== BGP / Autonomous System Lookup: ' + meta.asn + ' ===', 'head'),
              line('ASN        : ' + meta.asn + (meta.via !== 'direct' ? ' (resolved from ' + meta.via + ')' : ''), 'ok'),
              line('Holder     : ' + holder, 'cyan'),
              line('Announced  : ' + (ov.announced ? 'Yes' : 'No / Unknown') + ' · Prefixes seen: ' + prefs.length, 'accent'),
              line('', 'info'),
              line('--- Sample Announced BGP Prefixes (first 20) ---', 'accent')
            ];
            var rows = [];
            prefs.slice(0, 20).forEach(function (p, idx) {
              var pStr = p.prefix || String(p);
              rows.push([idx + 1, pStr]);
              out.push(line('  ' + pad(idx + 1, 4) + pStr, 'info'));
            });
            if (prefs.length > 20) out.push(line('  ... +' + (prefs.length - 20) + ' more prefixes.', 'dim'));
            return {
              ok: true,
              statusBadge: meta.asn + ' · ' + prefs.length + ' prefixes',
              modeUsed: 'RIPEstat + RDAP',
              kpis: [
                { k: 'ASN', v: meta.asn },
                { k: 'Holder', v: holder },
                { k: 'BGP Prefixes', v: String(prefs.length) },
                { k: 'Announced', v: ov.announced ? 'Active' : 'Unknown' }
              ],
              terminalLines: out,
              structuredTable: { columns: ['#', 'Announced Prefix'], rows: rows },
              rawExport: out.map(function (x) { return x.text; }).join('\n')
            };
          });
        });
      }
    },

    {
      id: 'reverse-ip',
      category: 'domain-infra',
      name: 'Reverse IP Lookup',
      mode: 'live',
      requiresAuth: false,
      shortDesc: 'Discover PTR, netblock, ASN & co-hosted domains on an IP',
      description: 'Resolves hostname to IP if needed, then combines PTR reverse DNS, RDAP netblock ownership, RIPEstat prefix/ASN, and HackerTarget reverse-IP domain list.',
      fields: [
        { key: 'target', label: 'IP Address or Domain', type: 'text', defaultValue: '93.184.216.34', placeholder: 'e.g. 93.184.216.34 or example.com' }
      ],
      examples: [
        { label: 'example.com IP', values: { target: '93.184.216.34' }, note: 'Shared host + prefix lookup' },
        { label: '1.1.1.1', values: { target: '1.1.1.1' }, note: 'PTR + RDAP + BGP prefix' }
      ],
      flagsGuide: [
        'HackerTarget free tier may occasionally rate-limit shared-domain lists; PTR, RDAP, and BGP prefix data remain available.'
      ],
      execute: function (values, ctx) {
        var hr = V.validateHostname(values.target);
        if (!hr.ok) return Promise.reject(new Error(hr.error));
        var ipCheck = V.validateIP(hr.value);
        var getIp = ipCheck.ok
          ? Promise.resolve(ipCheck.value)
          : API.queryDoH(hr.value, 'A', 'cloudflare', {}, ctx.signal).then(function (r) {
            var a = r.answers.find(function (x) { return x.typeName === 'A'; });
            if (!a) throw new Error('No A record found for ' + hr.value);
            return a.data;
          });

        return getIp.then(function (ip) {
          var ptrZone = ip.indexOf(':') !== -1 ? IP.ipv6ToPtr(ip) : IP.ipv4ToPtr(ip);
          return Promise.all([
            API.queryDoH(ptrZone, 'PTR', 'cloudflare', {}, ctx.signal).catch(function () { return { answers: [] }; }),
            API.fetchRdap('ip', ip, ctx.signal).catch(function () { return null; }),
            API.fetchIpPrefixRipe(ip, ctx.signal).catch(function () { return null; }),
            API.fetchReverseIpDomains(ip, ctx.signal).catch(function (e) { return { ok: false, text: e.message }; })
          ]).then(function (arr) {
            var ptr = arr[0].answers.map(function (a) { return a.data; });
            var rdap = arr[1] ? arr[1].data : null;
            var ripe = arr[2] && arr[2].data ? arr[2].data.data : null;
            var ht = arr[3];
            var domains = [];
            var htNote = '';
            if (ht && ht.text) {
              if (/error|api count exceeded/i.test(ht.text)) {
                htNote = ht.text;
              } else {
                domains = ht.text.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
              }
            }
            var netName = rdap ? (rdap.name || rdap.handle || '—') : '—';
            var bgpPrefix = ripe ? (ripe.resource || '—') : '—';
            var bgpAsn = ripe && ripe.asns && ripe.asns[0] ? ('AS' + ripe.asns[0].asn + ' (' + ripe.asns[0].holder + ')') : '—';

            var out = [
              line('=== Reverse IP Intelligence: ' + ip + ' ===', 'head'),
              line('PTR Host   : ' + (ptr.join(', ') || 'None'), 'ok'),
              line('RDAP Block : ' + netName + (rdap && rdap.startAddress ? ' (' + rdap.startAddress + ' - ' + rdap.endAddress + ')' : ''), 'cyan'),
              line('BGP Prefix : ' + bgpPrefix, 'info'),
              line('Origin ASN : ' + bgpAsn, 'accent'),
              line('', 'info'),
              line('--- Co-Hosted Domains (Reverse IP) ---', 'accent')
            ];
            if (htNote) {
              out.push(line('  Notice: ' + htNote, 'warn'));
            } else if (!domains.length) {
              out.push(line('  (no domains returned)', 'dim'));
            } else {
              domains.slice(0, 30).forEach(function (d) { out.push(line('  ' + d, 'info')); });
              if (domains.length > 30) out.push(line('  ... +' + (domains.length - 30) + ' more (see Table view).', 'dim'));
            }
            return {
              ok: true,
              statusBadge: ip + ' · ' + domains.length + ' host(s)',
              modeUsed: 'DoH PTR + RDAP + RIPEstat',
              kpis: [
                { k: 'IP', v: ip },
                { k: 'PTR', v: ptr[0] || 'None' },
                { k: 'BGP Prefix', v: bgpPrefix },
                { k: 'Co-Hosted', v: String(domains.length) }
              ],
              terminalLines: out,
              structuredTable: { columns: ['Co-Hosted Domain'], rows: domains.map(function (d) { return [d]; }) },
              rawExport: out.map(function (x) { return x.text; }).join('\n')
            };
          });
        });
      }
    }
  ];

  function getTool(id) {
    for (var i = 0; i < Tools.length; i++) {
      if (Tools[i].id === id) return Tools[i];
    }
    return Tools[0];
  }

  return {
    Categories: Categories,
    Tools: Tools,
    getTool: getTool
  };
});
