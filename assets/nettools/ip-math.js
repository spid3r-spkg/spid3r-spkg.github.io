/**
 * ip-math.js — Deterministic offline IPv4 & IPv6 subnet, CIDR, range,
 * classification, and reverse-DNS calculation engine.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.NetTools = root.NetTools || {};
  root.NetTools.IpMath = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var ALL_ONES_V4 = 0xFFFFFFFF;

  function ipToInt(ip) {
    var parts = String(ip).trim().split('.');
    if (parts.length !== 4) throw new Error('Invalid IPv4: ' + ip);
    var out = 0;
    for (var i = 0; i < 4; i++) {
      if (!/^\d{1,3}$/.test(parts[i])) throw new Error('Invalid octet: ' + parts[i]);
      var oct = Number(parts[i]);
      if (oct < 0 || oct > 255) throw new Error('Octet out of range: ' + oct);
      out = ((out << 8) | oct) >>> 0;
    }
    return out;
  }

  function intToIp(n) {
    var u = n >>> 0;
    return [
      (u >>> 24) & 255,
      (u >>> 16) & 255,
      (u >>> 8) & 255,
      u & 255
    ].join('.');
  }

  function toBinaryOctets(n) {
    var u = n >>> 0;
    var out = [];
    for (var shift = 24; shift >= 0; shift -= 8) {
      var oct = (u >>> shift) & 255;
      out.push(('00000000' + oct.toString(2)).slice(-8));
    }
    return out.join('.');
  }

  function toHex32(n) {
    return '0x' + ('00000000' + (n >>> 0).toString(16).toUpperCase()).slice(-8);
  }

  function prefixToMaskInt(prefix) {
    if (prefix <= 0) return 0;
    if (prefix >= 32) return ALL_ONES_V4;
    return (ALL_ONES_V4 << (32 - prefix)) >>> 0;
  }

  function prefixToMask(prefix) {
    return intToIp(prefixToMaskInt(prefix));
  }

  function maskToPrefix(maskStr) {
    var m = ipToInt(maskStr);
    var inv = (~m) >>> 0;
    if ((inv & (inv + 1)) !== 0) {
      throw new Error('Non-contiguous subnet mask: ' + maskStr);
    }
    var bits = 0;
    var cur = m;
    while (cur !== 0) {
      bits += 1;
      cur = (cur << 1) >>> 0;
    }
    return bits;
  }

  function parseMaskOrPrefix(val) {
    var s = String(val == null ? '' : val).trim().replace(/^\//, '');
    if (/^\d{1,2}$/.test(s)) {
      var p = Number(s);
      if (p < 0 || p > 32) throw new Error('Prefix must be 0..32');
      return p;
    }
    return maskToPrefix(s);
  }

  function ipv4ToPtr(ip) {
    var parts = String(ip).trim().split('.');
    if (parts.length !== 4) throw new Error('Invalid IPv4: ' + ip);
    return parts.slice().reverse().join('.') + '.in-addr.arpa';
  }

  function classifyIPv4(ip) {
    var n = ipToInt(ip);
    var o1 = (n >>> 24) & 255;
    var o2 = (n >>> 16) & 255;
    var o3 = (n >>> 8) & 255;

    var ipClass = 'Class E (Experimental)';
    if (o1 < 128) ipClass = 'Class A';
    else if (o1 < 192) ipClass = 'Class B';
    else if (o1 < 224) ipClass = 'Class C';
    else if (o1 < 240) ipClass = 'Class D (Multicast)';

    var scope = 'Public Unicast';
    var rfc = 'Global Internet Unicast';
    var isPrivate = false;
    var isSpecial = false;
    var isRoutable = true;
    var description = 'Publicly routable IPv4 address space.';

    if (n === 0) {
      scope = 'Unspecified';
      rfc = 'RFC 1122 (0.0.0.0/8)';
      isSpecial = true; isRoutable = false;
      description = 'This host on this network (default route / unspecified socket bind).';
    } else if (o1 === 0) {
      scope = 'This Network';
      rfc = 'RFC 1122 (0.0.0.0/8)';
      isSpecial = true; isRoutable = false;
      description = 'Source-only current network block.';
    } else if (n === ALL_ONES_V4) {
      scope = 'Limited Broadcast';
      rfc = 'RFC 919 (255.255.255.255/32)';
      isSpecial = true; isRoutable = false;
      description = 'Local Layer-2 subnet broadcast address.';
    } else if (o1 === 10) {
      scope = 'Private (RFC 1918)';
      rfc = 'RFC 1918 (10.0.0.0/8)';
      isPrivate = true; isRoutable = false;
      description = 'Private Class-A network block (16,777,216 addresses).';
    } else if (o1 === 172 && o2 >= 16 && o2 <= 31) {
      scope = 'Private (RFC 1918)';
      rfc = 'RFC 1918 (172.16.0.0/12)';
      isPrivate = true; isRoutable = false;
      description = 'Private Class-B network block (1,048,576 addresses).';
    } else if (o1 === 192 && o2 === 168) {
      scope = 'Private (RFC 1918)';
      rfc = 'RFC 1918 (192.168.0.0/16)';
      isPrivate = true; isRoutable = false;
      description = 'Private Class-C LAN / SOHO network block (65,536 addresses).';
    } else if (o1 === 127) {
      scope = 'Loopback';
      rfc = 'RFC 1122 (127.0.0.0/8)';
      isSpecial = true; isRoutable = false;
      description = 'Host-local loopback stack (traffic never leaves host).';
    } else if (o1 === 169 && o2 === 254) {
      scope = 'Link-Local (APIPA)';
      rfc = 'RFC 3927 (169.254.0.0/16)';
      isSpecial = true; isRoutable = false;
      description = 'Automatic Private IP Addressing when DHCP is unreachable.';
    } else if (o1 === 100 && o2 >= 64 && o2 <= 127) {
      scope = 'Carrier-Grade NAT (CGNAT)';
      rfc = 'RFC 6598 (100.64.0.0/10)';
      isPrivate = true; isSpecial = true; isRoutable = false;
      description = 'Shared ISP subscriber NAT address space.';
    } else if (o1 === 192 && o2 === 0 && o3 === 0) {
      scope = 'IETF Protocol Assignments';
      rfc = 'RFC 6890 (192.0.0.0/24)';
      isSpecial = true; isRoutable = false;
      description = 'Reserved for IETF protocol assignments.';
    } else if ((o1 === 192 && o2 === 0 && o3 === 2) || (o1 === 198 && o2 === 51 && o3 === 100) || (o1 === 203 && o2 === 0 && o3 === 113)) {
      scope = 'Documentation (TEST-NET)';
      rfc = 'RFC 5737';
      isSpecial = true; isRoutable = false;
      description = 'Reserved for documentation, examples, and lab tests.';
    } else if (o1 === 198 && (o2 === 18 || o2 === 19)) {
      scope = 'Benchmarking';
      rfc = 'RFC 2544 (198.18.0.0/15)';
      isSpecial = true; isRoutable = false;
      description = 'Reserved for network interconnect device benchmarking.';
    } else if (o1 >= 224 && o1 <= 239) {
      scope = 'Multicast';
      rfc = 'RFC 5771 (224.0.0.0/4)';
      isSpecial = true; isRoutable = false;
      description = 'IPv4 multicast group space.';
    } else if (o1 >= 240) {
      scope = 'Reserved (Future Use)';
      rfc = 'RFC 1112 (240.0.0.0/4)';
      isSpecial = true; isRoutable = false;
      description = 'Reserved Class E address space.';
    }

    return {
      ip: intToIp(n),
      integer: n,
      hex: toHex32(n),
      binary: toBinaryOctets(n),
      ptr: ipv4ToPtr(intToIp(n)),
      ipClass: ipClass,
      scope: scope,
      rfc: rfc,
      isPrivate: isPrivate,
      isSpecial: isSpecial,
      isRoutable: isRoutable,
      description: description
    };
  }

  function calculateSubnet(ipOrCidr, maskOrPrefix) {
    var ipStr = String(ipOrCidr).trim();
    var prefix;
    if (ipStr.indexOf('/') !== -1 && (maskOrPrefix == null || maskOrPrefix === '')) {
      var parts = ipStr.split('/');
      ipStr = parts[0];
      prefix = parseMaskOrPrefix(parts[1]);
    } else {
      if (ipStr.indexOf('/') !== -1) ipStr = ipStr.split('/')[0];
      prefix = parseMaskOrPrefix(maskOrPrefix == null ? 24 : maskOrPrefix);
    }

    var ipInt = ipToInt(ipStr);
    var maskInt = prefixToMaskInt(prefix);
    var wildcardInt = (~maskInt) >>> 0;
    var networkInt = (ipInt & maskInt) >>> 0;
    var broadcastInt = (networkInt | wildcardInt) >>> 0;
    var totalAddresses = Math.pow(2, 32 - prefix);

    var usableHosts, firstHostInt, lastHostInt;
    if (prefix === 32) {
      usableHosts = 1;
      firstHostInt = networkInt;
      lastHostInt = networkInt;
    } else if (prefix === 31) {
      usableHosts = 2; // RFC 3021 point-to-point
      firstHostInt = networkInt;
      lastHostInt = broadcastInt;
    } else {
      usableHosts = Math.max(0, totalAddresses - 2);
      firstHostInt = (networkInt + 1) >>> 0;
      lastHostInt = (broadcastInt - 1) >>> 0;
    }

    var cls = classifyIPv4(intToIp(networkInt));
    return {
      inputIp: intToIp(ipInt),
      cidr: intToIp(networkInt) + '/' + prefix,
      prefix: prefix,
      netmask: intToIp(maskInt),
      wildcard: intToIp(wildcardInt),
      network: intToIp(networkInt),
      broadcast: intToIp(broadcastInt),
      firstHost: intToIp(firstHostInt),
      lastHost: intToIp(lastHostInt),
      totalAddresses: totalAddresses,
      usableHosts: usableHosts,
      ipClass: cls.ipClass,
      scope: cls.scope,
      rfc: cls.rfc,
      isPrivate: cls.isPrivate,
      binaryIp: toBinaryOctets(ipInt),
      binaryMask: toBinaryOctets(maskInt),
      binaryNetwork: toBinaryOctets(networkInt),
      hexNetwork: toHex32(networkInt),
      ptrNetwork: ipv4ToPtr(intToIp(networkInt)),
      rfc3021: prefix === 31
    };
  }

  function splitSubnets(cidr, targetPrefix, maxRows) {
    var limit = maxRows || 256;
    var base = calculateSubnet(cidr);
    var newPrefix = parseMaskOrPrefix(targetPrefix);
    if (newPrefix < base.prefix) {
      throw new Error('Target prefix /' + newPrefix + ' must be >= base prefix /' + base.prefix);
    }
    var count = Math.pow(2, newPrefix - base.prefix);
    var step = Math.pow(2, 32 - newPrefix);
    var baseNet = ipToInt(base.network);
    var rows = [];
    var emit = Math.min(count, limit);
    for (var i = 0; i < emit; i++) {
      var netInt = (baseNet + i * step) >>> 0;
      rows.push(calculateSubnet(intToIp(netInt), newPrefix));
    }
    return {
      baseCidr: base.cidr,
      targetPrefix: newPrefix,
      totalSubnets: count,
      truncated: count > limit,
      subnets: rows
    };
  }

  function rangeToCidrs(startIp, endIp) {
    var start = ipToInt(startIp);
    var end = ipToInt(endIp);
    if (start > end) throw new Error('Start IP must be <= End IP.');
    var cidrs = [];
    var cur = start;
    while (cur <= end) {
      var maxSize = cur & (-cur);
      var maxPrefix = 32;
      if (cur === 0) {
        maxPrefix = 0;
      } else {
        var pow = 0;
        var tmp = maxSize >>> 0;
        while ((tmp & 1) === 0 && tmp !== 0) {
          pow += 1;
          tmp >>>= 1;
        }
        maxPrefix = 32 - pow;
      }
      var remaining = end - cur + 1;
      var remPow = Math.floor(Math.log(remaining) / Math.LN2);
      var maxFitPrefix = 32 - remPow;
      var prefix = Math.max(maxPrefix, maxFitPrefix);
      var blockSize = Math.pow(2, 32 - prefix);
      cidrs.push(intToIp(cur) + '/' + prefix);
      if (cur + blockSize > ALL_ONES_V4) break;
      cur = (cur + blockSize) >>> 0;
    }
    return cidrs;
  }

  function calculateIpRange(startIp, endIp) {
    var start = ipToInt(startIp);
    var end = ipToInt(endIp);
    if (start > end) throw new Error('Start IP (' + startIp + ') must be <= End IP (' + endIp + ').');
    var total = end - start + 1;
    var cidrs = rangeToCidrs(startIp, endIp);
    var startInfo = classifyIPv4(startIp);
    var endInfo = classifyIPv4(endIp);
    var sampleIps = [];
    var previewCount = Math.min(total, 10);
    for (var i = 0; i < previewCount; i++) {
      sampleIps.push(intToIp((start + i) >>> 0));
    }
    return {
      startIp: intToIp(start),
      endIp: intToIp(end),
      totalAddresses: total,
      usableEstimate: total <= 2 ? total : total - 2,
      cidrs: cidrs,
      cidrCount: cidrs.length,
      startScope: startInfo.scope,
      endScope: endInfo.scope,
      sampleIps: sampleIps
    };
  }

  function cidrContainsIp(cidr, ip) {
    var sub = calculateSubnet(cidr);
    var ipInt = ipToInt(ip);
    var netInt = ipToInt(sub.network);
    var bcastInt = ipToInt(sub.broadcast);
    return ipInt >= netInt && ipInt <= bcastInt;
  }

  function cidrsOverlap(cidrA, cidrB) {
    var a = calculateSubnet(cidrA);
    var b = calculateSubnet(cidrB);
    var aStart = ipToInt(a.network), aEnd = ipToInt(a.broadcast);
    var bStart = ipToInt(b.network), bEnd = ipToInt(b.broadcast);
    return aStart <= bEnd && bStart <= aEnd;
  }

  // ---- IPv6 Helpers (BigInt) ----
  function expandIPv6(ip) {
    var s = String(ip).trim().split('%')[0];
    var halves = s.split('::');
    if (halves.length > 2) throw new Error('Invalid IPv6: ' + ip);
    function parseSide(part) {
      if (!part) return [];
      var segs = part.split(':');
      var res = [];
      for (var i = 0; i < segs.length; i++) {
        var g = segs[i];
        if (g.indexOf('.') !== -1) {
          var v4 = ipToInt(g);
          res.push(((v4 >>> 16) & 0xFFFF).toString(16));
          res.push((v4 & 0xFFFF).toString(16));
        } else {
          res.push(g.toLowerCase());
        }
      }
      return res;
    }
    var groups;
    if (halves.length === 1) {
      groups = parseSide(s);
    } else {
      var left = parseSide(halves[0]);
      var right = parseSide(halves[1]);
      var missing = 8 - (left.length + right.length);
      if (missing < 1) throw new Error('Invalid IPv6 group count: ' + ip);
      groups = left.concat(new Array(missing).fill('0')).concat(right);
    }
    if (groups.length !== 8) throw new Error('IPv6 must expand to 8 groups: ' + ip);
    return groups.map(function (g) { return ('0000' + g).slice(-4); }).join(':');
  }

  function compressIPv6(ip) {
    var expanded = expandIPv6(ip);
    var groups = expanded.split(':').map(function (g) {
      return g.replace(/^0+/, '') || '0';
    });
    var bestStart = -1, bestLen = 0, curStart = -1, curLen = 0;
    for (var i = 0; i < 8; i++) {
      if (groups[i] === '0') {
        if (curStart === -1) { curStart = i; curLen = 1; }
        else { curLen += 1; }
        if (curLen > bestLen) { bestStart = curStart; bestLen = curLen; }
      } else {
        curStart = -1; curLen = 0;
      }
    }
    if (bestLen < 2) return groups.join(':');
    var left = groups.slice(0, bestStart).join(':');
    var right = groups.slice(bestStart + bestLen).join(':');
    return left + '::' + right;
  }

  function ipv6ToBigInt(ip) {
    var hex = expandIPv6(ip).replace(/:/g, '');
    return BigInt('0x' + hex);
  }

  function bigIntToIPv6(val) {
    var hex = val.toString(16);
    while (hex.length < 32) hex = '0' + hex;
    var groups = [];
    for (var i = 0; i < 32; i += 4) groups.push(hex.slice(i, i + 4));
    return compressIPv6(groups.join(':'));
  }

  function ipv6ToPtr(ip) {
    var hex = expandIPv6(ip).replace(/:/g, '');
    return hex.split('').reverse().join('.') + '.ip6.arpa';
  }

  function classifyIPv6(ip) {
    var exp = expandIPv6(ip);
    var val = ipv6ToBigInt(exp);
    var scope = 'Global Unicast (2000::/3)';
    var rfc = 'RFC 4291 / RFC 3587';
    var isPrivate = false;
    if (val === 0n) {
      scope = 'Unspecified (::/128)'; rfc = 'RFC 4291';
    } else if (val === 1n) {
      scope = 'Loopback (::1/128)'; rfc = 'RFC 4291';
    } else if (exp.indexOf('fe80:') === 0 || exp.indexOf('fe9') === 0 || exp.indexOf('fea') === 0 || exp.indexOf('feb') === 0) {
      scope = 'Link-Local Unicast (fe80::/10)'; rfc = 'RFC 4291'; isPrivate = true;
    } else if (exp.indexOf('fc') === 0 || exp.indexOf('fd') === 0) {
      scope = 'Unique Local Address / ULA (fc00::/7)'; rfc = 'RFC 4193'; isPrivate = true;
    } else if (exp.indexOf('ff') === 0) {
      scope = 'Multicast (ff00::/8)'; rfc = 'RFC 4291';
    } else if (exp.indexOf('2001:0db8:') === 0) {
      scope = 'Documentation (2001:db8::/32)'; rfc = 'RFC 3849';
    }
    return {
      expanded: exp,
      compressed: compressIPv6(exp),
      ptr: ipv6ToPtr(exp),
      scope: scope,
      rfc: rfc,
      isPrivate: isPrivate
    };
  }

  function calculateSubnetV6(cidr) {
    var parts = String(cidr).trim().split('/');
    if (parts.length !== 2) throw new Error('Invalid IPv6 CIDR');
    var prefix = parseInt(parts[1], 10);
    if (isNaN(prefix) || prefix < 0 || prefix > 128) throw new Error('IPv6 prefix must be 0..128');
    var val = ipv6ToBigInt(parts[0]);
    var allOnes = (1n << 128n) - 1n;
    var hostBits = BigInt(128 - prefix);
    var mask = prefix === 0 ? 0n : ((allOnes << hostBits) & allOnes);
    var net = val & mask;
    var last = net | (allOnes ^ mask);
    var total = 1n << hostBits;
    var info = classifyIPv6(bigIntToIPv6(net));
    return {
      cidr: bigIntToIPv6(net) + '/' + prefix,
      prefix: prefix,
      expandedInput: expandIPv6(parts[0]),
      network: bigIntToIPv6(net),
      expandedNetwork: expandIPv6(bigIntToIPv6(net)),
      firstAddress: bigIntToIPv6(net),
      lastAddress: bigIntToIPv6(last),
      totalAddresses: total.toString(),
      scope: info.scope,
      rfc: info.rfc,
      ptr: info.ptr
    };
  }

  return {
    ipToInt: ipToInt,
    intToIp: intToIp,
    toBinaryOctets: toBinaryOctets,
    toHex32: toHex32,
    prefixToMaskInt: prefixToMaskInt,
    prefixToMask: prefixToMask,
    maskToPrefix: maskToPrefix,
    parseMaskOrPrefix: parseMaskOrPrefix,
    ipv4ToPtr: ipv4ToPtr,
    classifyIPv4: classifyIPv4,
    calculateSubnet: calculateSubnet,
    splitSubnets: splitSubnets,
    rangeToCidrs: rangeToCidrs,
    calculateIpRange: calculateIpRange,
    cidrContainsIp: cidrContainsIp,
    cidrsOverlap: cidrsOverlap,
    expandIPv6: expandIPv6,
    compressIPv6: compressIPv6,
    ipv6ToBigInt: ipv6ToBigInt,
    bigIntToIPv6: bigIntToIPv6,
    ipv6ToPtr: ipv6ToPtr,
    classifyIPv6: classifyIPv6,
    calculateSubnetV6: calculateSubnetV6
  };
});
