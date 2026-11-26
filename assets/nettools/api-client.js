/**
 * api-client.js — Browser fetch wrappers for CORS-enabled diagnostic APIs
 * (DoH resolvers, ipify, ipwho.is, RDAP, RIPEstat, crt.sh, HackerTarget)
 * plus optional loopback Spid3r Local Companion Agent bridge.
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
  root.NetTools.ApiClient = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (V) {
  'use strict';

  var DOH_RESOLVERS = {
    cloudflare: {
      id: 'cloudflare',
      name: 'Cloudflare (1.1.1.1)',
      ip: '1.1.1.1',
      url: 'https://cloudflare-dns.com/dns-query'
    },
    google: {
      id: 'google',
      name: 'Google Public DNS (8.8.8.8)',
      ip: '8.8.8.8',
      url: 'https://dns.google/resolve'
    },
    dnssb: {
      id: 'dnssb',
      name: 'DNS.SB (185.222.222.222)',
      ip: '185.222.222.222',
      url: 'https://doh.sb/dns-query'
    },
    cloudflare2: {
      id: 'cloudflare2',
      name: 'Cloudflare Secondary (1.0.0.1)',
      ip: '1.0.0.1',
      url: 'https://1.0.0.1/dns-query'
    },
    mozilla: {
      id: 'mozilla',
      name: 'Mozilla Cloudflare TRR',
      ip: '104.16.248.249',
      url: 'https://mozilla.cloudflare-dns.com/dns-query'
    }
  };

  var DNS_RCODES = {
    0: 'NOERROR',
    1: 'FORMERR',
    2: 'SERVFAIL',
    3: 'NXDOMAIN',
    4: 'NOTIMP',
    5: 'REFUSED'
  };

  var DNS_TYPE_NAMES = {
    1: 'A', 2: 'NS', 5: 'CNAME', 6: 'SOA', 12: 'PTR',
    15: 'MX', 16: 'TXT', 28: 'AAAA', 33: 'SRV', 46: 'RRSIG',
    48: 'DNSKEY', 257: 'CAA'
  };

  var agentState = {
    url: 'http://127.0.0.1:8787',
    token: '',
    connected: false,
    os: '',
    version: ''
  };

  try {
    if (typeof sessionStorage !== 'undefined') {
      agentState.url = sessionStorage.getItem('spid3r-nt-agent-url') || 'http://127.0.0.1:8787';
      agentState.token = sessionStorage.getItem('spid3r-nt-agent-token') || '';
    }
  } catch (e) {}

  function nowMs() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function fetchWithTimeout(url, opts, timeoutMs, outerSignal) {
    opts = opts || {};
    var ms = timeoutMs || 10000;
    var ctrl = new AbortController();
    var timer = setTimeout(function () {
      ctrl.abort(new Error('Request timed out after ' + ms + ' ms'));
    }, ms);
    var onOuterAbort = null;
    if (outerSignal) {
      if (outerSignal.aborted) {
        clearTimeout(timer);
        ctrl.abort(outerSignal.reason || new Error('Cancelled'));
      } else {
        onOuterAbort = function () {
          ctrl.abort(outerSignal.reason || new Error('Cancelled by user'));
        };
        outerSignal.addEventListener('abort', onOuterAbort, { once: true });
      }
    }
    var reqOpts = Object.assign({}, opts, { signal: ctrl.signal });
    return fetch(url, reqOpts).finally(function () {
      clearTimeout(timer);
      if (outerSignal && onOuterAbort) {
        outerSignal.removeEventListener('abort', onOuterAbort);
      }
    });
  }

  function fetchJson(url, opts, timeoutMs, signal) {
    var t0 = nowMs();
    return fetchWithTimeout(url, opts, timeoutMs, signal).then(function (resp) {
      var elapsed = Math.round(nowMs() - t0);
      if (!resp.ok) {
        return resp.text().catch(function () { return ''; }).then(function (txt) {
          var err = new Error('HTTP ' + resp.status + ' ' + resp.statusText + (txt ? ': ' + txt.slice(0, 140) : ''));
          err.status = resp.status;
          err.elapsedMs = elapsed;
          throw err;
        });
      }
      return resp.json().then(function (data) {
        return { data: data, status: resp.status, elapsedMs: elapsed, headers: resp.headers };
      });
    });
  }

  function queryDoH(name, type, resolverKey, opts, signal) {
    opts = opts || {};
    var resolver = DOH_RESOLVERS[resolverKey || 'cloudflare'] || DOH_RESOLVERS.cloudflare;
    var qs = 'name=' + encodeURIComponent(name) + '&type=' + encodeURIComponent(type || 'A');
    if (opts.dnssec) qs += '&do=1';
    if (opts.cd) qs += '&cd=1';
    var url = resolver.url + '?' + qs;
    return fetchJson(url, {
      method: 'GET',
      headers: { Accept: 'application/dns-json' }
    }, opts.timeoutMs || 8000, signal).then(function (res) {
      var body = res.data || {};
      var rcode = typeof body.Status === 'number' ? body.Status : 0;
      return {
        resolver: resolver,
        rcode: rcode,
        statusName: DNS_RCODES[rcode] || ('RCODE_' + rcode),
        elapsedMs: res.elapsedMs,
        ad: !!body.AD,
        cd: !!body.CD,
        ra: !!body.RA,
        rd: !!body.RD,
        tc: !!body.TC,
        question: body.Question || [],
        answers: (body.Answer || []).map(function (a) {
          return {
            name: a.name || name,
            type: a.type,
            typeName: DNS_TYPE_NAMES[a.type] || String(a.type),
            ttl: typeof a.TTL === 'number' ? a.TTL : 0,
            data: String(a.data || '')
          };
        }),
        authority: (body.Authority || []).map(function (a) {
          return {
            name: a.name || name,
            type: a.type,
            typeName: DNS_TYPE_NAMES[a.type] || String(a.type),
            ttl: typeof a.TTL === 'number' ? a.TTL : 0,
            data: String(a.data || '')
          };
        })
      };
    });
  }

  function fetchPublicIp(signal) {
    var tasks = [
      fetchJson('https://api64.ipify.org?format=json', {}, 6000, signal).then(function (r) { return r.data.ip; }).catch(function () { return null; }),
      fetchJson('https://api.ipify.org?format=json', {}, 6000, signal).then(function (r) { return r.data.ip; }).catch(function () { return null; }),
      fetchJson('https://ipwho.is/', {}, 8000, signal).then(function (r) { return r.data; }).catch(function () { return null; })
    ];
    return Promise.all(tasks).then(function (res) {
      var ip64 = res[0];
      var ip4 = res[1];
      var who = res[2];
      var primary = ip64 || ip4 || (who && who.ip) || null;
      if (!primary) {
        throw new Error('Could not determine public IP from ipify or ipwho.is.');
      }
      return {
        primaryIp: primary,
        ipv4: ip4 || (who && who.type === 'IPv4' ? who.ip : null),
        ipv6: (ip64 && ip64.indexOf(':') !== -1) ? ip64 : null,
        geo: who && who.success !== false ? who : null
      };
    });
  }

  function fetchIpGeo(ip, signal) {
    var target = ip ? encodeURIComponent(ip) : '';
    return fetchJson('https://ipwho.is/' + target, {}, 9000, signal).then(function (res) {
      if (res.data && res.data.success === false) {
        throw new Error(res.data.message || 'Geolocation lookup failed for ' + ip);
      }
      return res;
    });
  }

  function fetchRdap(kind, query, signal) {
    var path = kind + '/' + encodeURIComponent(query);
    return fetchJson('https://rdap.org/' + path, {
      headers: { Accept: 'application/rdap+json, application/json' }
    }, 10000, signal);
  }

  function fetchAsnRipe(resource, signal) {
    var r = encodeURIComponent(resource);
    return Promise.all([
      fetchJson('https://stat.ripe.net/data/as-overview/data.json?resource=' + r, {}, 9000, signal).catch(function () { return null; }),
      fetchJson('https://stat.ripe.net/data/announced-prefixes/data.json?resource=' + r, {}, 9000, signal).catch(function () { return null; }),
      fetchRdap('autnum', String(resource).replace(/^AS/i, ''), signal).catch(function () { return null; })
    ]).then(function (arr) {
      return {
        overview: arr[0] ? arr[0].data.data : null,
        prefixes: arr[1] ? arr[1].data.data : null,
        rdap: arr[2] ? arr[2].data : null
      };
    });
  }

  function fetchIpPrefixRipe(ip, signal) {
    return fetchJson('https://stat.ripe.net/data/prefix-overview/data.json?resource=' + encodeURIComponent(ip), {}, 9000, signal);
  }

  function fetchCertsCt(domain, signal) {
    var url = 'https://crt.sh/?q=' + encodeURIComponent(domain) + '&output=json';
    return fetchJson(url, {}, 12000, signal);
  }

  function fetchReverseIpDomains(ip, signal) {
    var url = 'https://api.hackertarget.com/reverseiplookup/?q=' + encodeURIComponent(ip);
    var t0 = nowMs();
    return fetchWithTimeout(url, {}, 9000, signal).then(function (resp) {
      var elapsed = Math.round(nowMs() - t0);
      return resp.text().then(function (text) {
        return { ok: resp.ok, status: resp.status, text: text.trim(), elapsedMs: elapsed };
      });
    });
  }

  function probeHttpOnce(opts, signal) {
    var url = opts.url;
    var method = (opts.method || 'GET').toUpperCase();
    var headers = opts.headers || {};
    var body = (method === 'GET' || method === 'HEAD') ? undefined : opts.body;
    var t0 = nowMs();
    return fetchWithTimeout(url, {
      method: method,
      mode: 'cors',
      cache: 'no-store',
      redirect: opts.followRedirects === false ? 'manual' : 'follow',
      headers: headers,
      body: body
    }, opts.timeoutMs || 10000, signal).then(function (resp) {
      var ttfb = Math.round(nowMs() - t0);
      return resp.text().catch(function () { return ''; }).then(function (txt) {
        var total = Math.round(nowMs() - t0);
        var hdrs = {};
        resp.headers.forEach(function (v, k) { hdrs[k] = v; });
        return {
          mode: 'cors',
          opaque: false,
          status: resp.status,
          statusText: resp.statusText,
          redirected: resp.redirected,
          finalUrl: resp.url || url,
          ttfbMs: ttfb,
          totalMs: total,
          headers: hdrs,
          body: txt,
          bytes: txt.length
        };
      });
    }).catch(function (corsErr) {
      if (corsErr && corsErr.name === 'AbortError') throw corsErr;
      if (!opts.allowOpaqueFallback) throw corsErr;
      var t1 = nowMs();
      return fetchWithTimeout(url, {
        method: method === 'HEAD' ? 'HEAD' : 'GET',
        mode: 'no-cors',
        cache: 'no-store'
      }, opts.timeoutMs || 10000, signal).then(function () {
        var total = Math.round(nowMs() - t1);
        return {
          mode: 'no-cors',
          opaque: true,
          status: 0,
          statusText: 'Opaque (CORS blocked reading status/headers)',
          redirected: false,
          finalUrl: url,
          ttfbMs: total,
          totalMs: total,
          headers: {},
          body: '',
          bytes: 0,
          corsNote: 'Target reached over HTTPS/HTTP, but remote server does not send Access-Control-Allow-Origin.'
        };
      });
    });
  }

  // ---- Local Companion Agent ----
  function getAgentState() {
    return Object.assign({}, agentState);
  }

  function setAgentConfig(url, token) {
    if (V) {
      var check = V.validateLoopbackAgentUrl(url);
      if (!check.ok) throw new Error(check.error);
      agentState.url = check.value;
    } else {
      agentState.url = String(url || 'http://127.0.0.1:8787').replace(/\/+$/, '');
    }
    agentState.token = String(token || '').trim();
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('spid3r-nt-agent-url', agentState.url);
        sessionStorage.setItem('spid3r-nt-agent-token', agentState.token);
      }
    } catch (e) {}
  }

  function disconnectAgent() {
    agentState.connected = false;
    agentState.os = '';
    agentState.version = '';
    agentState.token = '';
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('spid3r-nt-agent-token');
      }
    } catch (e) {}
  }

  function connectAgent(url, token, signal) {
    setAgentConfig(url, token);
    if (!agentState.token) {
      return Promise.reject(new Error('Session token printed by server.matrix is required.'));
    }
    return fetchJson(agentState.url + '/health', {}, 3500, signal).then(function (res) {
      var d = res.data || {};
      if (!d.ok || d.service !== 'spid3r-nettools-agent') {
        throw new Error('Unexpected response from loopback endpoint.');
      }
      // Verify token with a harmless hostname check
      return runAgentTool('hostname', {}, false, signal).then(function () {
        agentState.connected = true;
        agentState.os = d.os || 'unknown';
        agentState.version = d.version || '0.1.0';
        return getAgentState();
      });
    }).catch(function (err) {
      agentState.connected = false;
      throw err;
    });
  }

  function runAgentTool(tool, params, authorized, signal) {
    if (!agentState.url || !agentState.token) {
      return Promise.reject(new Error('Local Companion Agent is not configured.'));
    }
    return fetchJson(agentState.url + '/api/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-NetTools-Token': agentState.token
      },
      body: JSON.stringify({
        tool: tool,
        params: params || {},
        authorized: !!authorized
      })
    }, 25000, signal).then(function (res) {
      return res.data;
    });
  }

  return {
    DOH_RESOLVERS: DOH_RESOLVERS,
    DNS_RCODES: DNS_RCODES,
    DNS_TYPE_NAMES: DNS_TYPE_NAMES,
    fetchJson: fetchJson,
    queryDoH: queryDoH,
    fetchPublicIp: fetchPublicIp,
    fetchIpGeo: fetchIpGeo,
    fetchRdap: fetchRdap,
    fetchAsnRipe: fetchAsnRipe,
    fetchIpPrefixRipe: fetchIpPrefixRipe,
    fetchCertsCt: fetchCertsCt,
    fetchReverseIpDomains: fetchReverseIpDomains,
    probeHttpOnce: probeHttpOnce,
    getAgentState: getAgentState,
    setAgentConfig: setAgentConfig,
    disconnectAgent: disconnectAgent,
    connectAgent: connectAgent,
    runAgentTool: runAgentTool
  };
});
