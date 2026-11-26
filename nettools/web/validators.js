/**
 * validators.js — Strict input validation and CLI argument sanitization
 * for the Spid3r Network Tools workbench.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.NetTools = root.NetTools || {};
  root.NetTools.Validators = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SHELL_META_RE = /[\s\x00-\x1f\x7f;|&$`'"<>(){}\[\]\\*?!/]/;
  var DNS_TYPES = {
    A: true, AAAA: true, CNAME: true, MX: true, TXT: true,
    NS: true, SOA: true, PTR: true, SRV: true, CAA: true, ANY: true
  };

  function str(v) {
    return v == null ? '' : String(v).trim();
  }

  function validateIPv4(input) {
    var s = str(input);
    if (!s) return { ok: false, error: 'IPv4 address is required.' };
    var parts = s.split('.');
    if (parts.length !== 4) {
      return { ok: false, error: 'IPv4 address must have 4 dot-separated octets.' };
    }
    for (var i = 0; i < 4; i++) {
      var p = parts[i];
      if (!/^\d{1,3}$/.test(p)) {
        return { ok: false, error: 'Invalid IPv4 octet "' + p + '".' };
      }
      if (p.length > 1 && p.charAt(0) === '0') {
        return { ok: false, error: 'Leading zeros are not permitted in IPv4 octet "' + p + '".' };
      }
      var n = Number(p);
      if (n < 0 || n > 255) {
        return { ok: false, error: 'IPv4 octet "' + p + '" must be between 0 and 255.' };
      }
    }
    return { ok: true, value: s };
  }

  function validateIPv6(input) {
    var s = str(input);
    if (!s) return { ok: false, error: 'IPv6 address is required.' };
    if (s.indexOf('%') !== -1) s = s.split('%')[0];
    if (!s || s.indexOf(':') === -1 || /[^0-9a-fA-F:.]/.test(s)) {
      return { ok: false, error: 'Invalid IPv6 characters.' };
    }
    var halves = s.split('::');
    if (halves.length > 2) {
      return { ok: false, error: 'IPv6 address may contain "::" at most once.' };
    }
    function countGroups(part) {
      if (!part) return 0;
      var segs = part.split(':');
      var total = 0;
      for (var i = 0; i < segs.length; i++) {
        var g = segs[i];
        if (!g) return -1;
        if (g.indexOf('.') !== -1) {
          if (i !== segs.length - 1 || !validateIPv4(g).ok) return -1;
          total += 2;
        } else if (/^[0-9a-fA-F]{1,4}$/.test(g)) {
          total += 1;
        } else {
          return -1;
        }
      }
      return total;
    }
    if (halves.length === 1) {
      if (countGroups(s) !== 8) {
        return { ok: false, error: 'Uncompressed IPv6 address must have 8 groups.' };
      }
      return { ok: true, value: s };
    }
    var left = countGroups(halves[0]);
    var right = countGroups(halves[1]);
    if (left < 0 || right < 0 || left + right > 7) {
      return { ok: false, error: 'Invalid compressed IPv6 group count.' };
    }
    return { ok: true, value: s };
  }

  function validateIP(input) {
    var v4 = validateIPv4(input);
    if (v4.ok) return { ok: true, version: 4, value: v4.value };
    var v6 = validateIPv6(input);
    if (v6.ok) return { ok: true, version: 6, value: v6.value };
    return { ok: false, error: 'Enter a valid IPv4 or IPv6 address.' };
  }

  function validateHostname(input) {
    var raw = str(input);
    if (!raw) return { ok: false, error: 'Hostname or IP address is required.' };
    if (raw.length > 253) return { ok: false, error: 'Hostname exceeds 253 characters.' };
    if (raw.charAt(0) === '-') return { ok: false, error: 'Hostname cannot begin with "-".' };
    if (validateIPv4(raw).ok || validateIPv6(raw).ok) {
      return { ok: true, value: raw };
    }
    if (SHELL_META_RE.test(raw)) {
      return { ok: false, error: 'Hostname contains disallowed characters or whitespace.' };
    }
    var trimmed = raw.endsWith('.') ? raw.slice(0, -1) : raw;
    if (!trimmed) return { ok: false, error: 'Invalid hostname.' };
    var labels = trimmed.split('.');
    for (var i = 0; i < labels.length; i++) {
      var lbl = labels[i];
      if (!lbl || lbl.length > 63) {
        return { ok: false, error: 'Invalid DNS label "' + lbl + '".' };
      }
      if (!/^[a-zA-Z0-9_](?:[a-zA-Z0-9_-]{0,61}[a-zA-Z0-9_])?$/.test(lbl)) {
        return { ok: false, error: 'Invalid characters in DNS label "' + lbl + '".' };
      }
    }
    return { ok: true, value: trimmed };
  }

  function validateCIDR(input) {
    var s = str(input);
    var parts = s.split('/');
    if (parts.length !== 2) {
      return { ok: false, error: 'CIDR must be in "<ip>/<prefix>" format (e.g. 192.168.1.0/24).' };
    }
    var ipRes = validateIP(parts[0]);
    if (!ipRes.ok) return ipRes;
    if (!/^\d{1,3}$/.test(parts[1])) {
      return { ok: false, error: 'CIDR prefix must be an integer.' };
    }
    var prefix = Number(parts[1]);
    var maxPrefix = ipRes.version === 4 ? 32 : 128;
    if (prefix < 0 || prefix > maxPrefix) {
      return { ok: false, error: 'IPv' + ipRes.version + ' prefix must be between 0 and ' + maxPrefix + '.' };
    }
    return { ok: true, version: ipRes.version, ip: ipRes.value, prefix: prefix, value: ipRes.value + '/' + prefix };
  }

  function validatePort(input) {
    var s = str(input);
    if (!/^\d{1,5}$/.test(s)) {
      return { ok: false, error: 'Port must be an integer between 1 and 65535.' };
    }
    var n = Number(s);
    if (n < 1 || n > 65535) {
      return { ok: false, error: 'Port must be between 1 and 65535.' };
    }
    return { ok: true, value: n };
  }

  function validatePortList(input, maxPorts) {
    var limit = maxPorts || 25;
    var s = str(input);
    if (!s) return { ok: false, error: 'At least one port is required.' };
    var tokens = s.split(',');
    var ports = [];
    var seen = {};
    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i].trim();
      if (!tok) continue;
      if (tok.indexOf('-') !== -1) {
        var bounds = tok.split('-');
        if (bounds.length !== 2) return { ok: false, error: 'Invalid port range "' + tok + '".' };
        var a = validatePort(bounds[0]);
        var b = validatePort(bounds[1]);
        if (!a.ok) return a;
        if (!b.ok) return b;
        if (a.value > b.value) return { ok: false, error: 'Port range start must be <= end ("' + tok + '").' };
        if (b.value - a.value + 1 > limit) {
          return { ok: false, error: 'Port range "' + tok + '" exceeds maximum of ' + limit + ' ports per check.' };
        }
        for (var p = a.value; p <= b.value; p++) {
          if (!seen[p]) { seen[p] = true; ports.push(p); }
        }
      } else {
        var single = validatePort(tok);
        if (!single.ok) return single;
        if (!seen[single.value]) { seen[single.value] = true; ports.push(single.value); }
      }
      if (ports.length > limit) {
        return { ok: false, error: 'Maximum ' + limit + ' ports allowed per diagnostic run.' };
      }
    }
    if (!ports.length) return { ok: false, error: 'No valid ports provided.' };
    return { ok: true, value: ports };
  }

  function validateUrl(input) {
    var s = str(input);
    if (!s) return { ok: false, error: 'URL is required.' };
    if (/[\x00-\x1f\x7f\s]/.test(s)) {
      return { ok: false, error: 'URL must not contain whitespace or control characters.' };
    }
    try {
      var u = new URL(s);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return { ok: false, error: 'Only http:// and https:// URLs are supported.' };
      }
      if (!u.hostname) {
        return { ok: false, error: 'URL is missing a hostname.' };
      }
      var hostClean = u.hostname.replace(/^\[|\]$/g, '');
      var hostRes = validateHostname(hostClean);
      if (!hostRes.ok) return hostRes;
      return { ok: true, value: u.toString(), url: u };
    } catch (e) {
      return { ok: false, error: 'Invalid URL. Include scheme, e.g. https://example.com' };
    }
  }

  function validateASN(input) {
    var s = str(input).toUpperCase();
    if (!s) return { ok: false, error: 'ASN is required (e.g. AS13335).' };
    var numStr = s.indexOf('AS') === 0 ? s.slice(2) : s;
    if (!/^\d{1,10}$/.test(numStr)) {
      return { ok: false, error: 'ASN must be numeric or prefixed with AS (e.g. AS13335).' };
    }
    var n = Number(numStr);
    if (n < 1 || n > 4294967295) {
      return { ok: false, error: 'ASN must be between 1 and 4294967295.' };
    }
    return { ok: true, value: 'AS' + n, number: n };
  }

  function validateDnsType(input) {
    var s = str(input).toUpperCase() || 'A';
    if (!DNS_TYPES[s]) {
      return { ok: false, error: 'Unsupported DNS record type "' + s + '".' };
    }
    return { ok: true, value: s };
  }

  function validateLoopbackAgentUrl(input) {
    var u = validateUrl(input);
    if (!u.ok) return u;
    var h = u.url.hostname.toLowerCase();
    if (h !== '127.0.0.1' && h !== 'localhost' && h !== '[::1]' && h !== '::1') {
      return { ok: false, error: 'Local Companion Agent URL must bind to loopback (127.0.0.1 or localhost).' };
    }
    return { ok: true, value: u.url.origin };
  }

  function sanitizeCliArg(input, fallback) {
    var s = str(input);
    if (!s || /[\x00-\x1f\x7f;|&$`'"<>(){}\\]/.test(s)) {
      return fallback || '<target>';
    }
    return s;
  }

  function clampInt(val, lo, hi, fallback) {
    var n = parseInt(val, 10);
    if (isNaN(n)) return fallback;
    if (n < lo) return lo;
    if (n > hi) return hi;
    return n;
  }

  return {
    validateIPv4: validateIPv4,
    validateIPv6: validateIPv6,
    validateIP: validateIP,
    validateHostname: validateHostname,
    validateCIDR: validateCIDR,
    validatePort: validatePort,
    validatePortList: validatePortList,
    validateUrl: validateUrl,
    validateASN: validateASN,
    validateDnsType: validateDnsType,
    validateLoopbackAgentUrl: validateLoopbackAgentUrl,
    sanitizeCliArg: sanitizeCliArg,
    clampInt: clampInt
  };
});
