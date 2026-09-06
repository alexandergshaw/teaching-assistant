/**
 * The address-level half of the LMS SSRF boundary: given an IPv4 or IPv6
 * address - a real octet tuple or hex-group tuple, not a hostname string -
 * decide whether it is drawn from the IANA special-purpose registry
 * (loopback, RFC1918, link-local/metadata, carrier-grade NAT, the
 * documentation/benchmarking TEST-NET blocks, multicast, and the IPv6
 * transition forms that embed one of those IPv4 addresses).
 *
 * EXTRACTED FROM `lms-credential-rules.ts` (E-ARCH5 in docs/lms-credentials-
 * acceptance-criteria.md), NOT DUPLICATED. That module used these exact
 * rules to judge an IP literal a user typed into a base-URL field.
 * `canvas-fetch.ts` needs the SAME rules to judge an address `dns.lookup`
 * returned for a hostname that passed that check - the fetch layer's whole
 * job (closing E-SSRF1/SEC1, DNS rebinding) is re-running this exact
 * classification against the RESOLVED address, not the name. Two
 * independently-written copies of "is this address reserved" that could
 * drift apart is precisely the "checker and fetcher disagree" failure
 * `lms-credential-rules.ts`'s own header names as the thing every historical
 * SSRF-checker bypass comes from - so there is exactly one copy of this
 * logic in the repository, here.
 *
 * THIS FILE IS A LEAF. It imports nothing from `lms-credential-rules.ts`,
 * `canvas-fetch.ts`, or anything else in the app - only `lms-credential-
 * rules.ts` and `canvas-fetch.ts` import FROM here. A back-import would
 * create a cycle, and a cycle between two modules that each export functions
 * the other calls at module-init time silently resolves the not-yet-
 * initialized side to `undefined` in Node/CommonJS-style interop - `tsc`
 * does not catch this, it is a runtime-only failure, and this repository has
 * shipped that exact shape of bug before. Keep this file free of imports.
 *
 * NO BRACKETS HERE. `URL.hostname` wraps an IPv6 literal in `[...]`;
 * `dns.lookup`'s returned `address` string never does. Rather than have two
 * call sites disagree about whether the bracket-stripping already happened,
 * every function below takes the UNBRACKETED form and the one caller that
 * has a bracketed string (`lms-credential-rules.ts`, reading `URL.hostname`)
 * strips the brackets itself before calling in.
 */

// ============================================================================
// IPv4
// ============================================================================

/** A strict four-octet IPv4 address, each value already known to be 0-255. */
export type Ipv4Octets = readonly [number, number, number, number];

/**
 * Parses a dotted-decimal IPv4 address (`"127.0.0.1"`) into its four octets.
 * Deliberately strict (exactly four groups of 1-3 digits, each 0-255) rather
 * than a looser "looks numeric" test. The two callers feed this two
 * different kinds of already-narrowed string - `URL.hostname` (which has
 * already canonicalized decimal/octal/hex encodings to dotted-decimal before
 * this module ever sees it) and `dns.lookup`'s returned `address` for an
 * A record (which the platform's own resolver already formats this way) -
 * so a stricter local regex here only ever narrows which strings this
 * function *bothers* to classify as IPv4; it can never be the reason a real
 * address is missed.
 */
export function parseIpv4(address: string): Ipv4Octets | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address);
  if (!match) {
    return null;
  }
  const octets = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
  if (octets.some((n) => n > 255)) {
    // Unreachable for a `URL.hostname` input (that parser already refuses an
    // out-of-range octet) and unreachable for a real `dns.lookup` answer -
    // kept as a defensive refusal rather than trusting either caller's
    // invariant silently.
    return null;
  }
  return octets as unknown as Ipv4Octets;
}

/**
 * True for any IPv4 address drawn from the IANA IPv4 Special-Purpose
 * Address Registry: not just the ranges the acceptance doc names outright
 * (loopback, link-local/metadata, the three RFC1918 blocks), but the wider
 * set of addresses that were never handed out for ordinary public use
 * either (carrier-grade NAT, the documentation/benchmarking TEST-NET
 * blocks, 6to4 relay anycast, multicast, and the reserved top of the
 * address space). None of this narrows what a REAL institutional Canvas
 * host can be - no institution's public DNS name resolves into any of
 * these blocks - so extending the deny-list this far costs nothing while
 * closing off address literals nobody bothered to name explicitly.
 *
 * Every branch checks the FULL range (`a === 127`, not `address.startsWith
 * ("127.0.0.1")`): the sibling test this module must NOT fail is the one
 * where a public address merely sits next to a private block (172.32.0.1,
 * 11.0.0.1) - a check written as a string-prefix match would either miss
 * part of the real private range or refuse a public neighbor of one, and
 * there is no way to know which failure mode you have until someone hits it
 * in production.
 */
export function isSpecialPurposeIpv4([a, b, c, d]: Ipv4Octets): boolean {
  void d;
  if (a === 0) return true; // 0.0.0.0/8 - "this network", includes the unspecified address
  if (a === 10) return true; // 10.0.0.0/8 - RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 - carrier-grade NAT
  if (a === 127) return true; // 127.0.0.0/8 - loopback, the WHOLE block, not just 127.0.0.1
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 - link-local, covers both metadata addresses
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 - RFC1918
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 - IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24 - TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return true; // 192.88.99.0/24 - 6to4 relay anycast
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 - RFC1918
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 - benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 - TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 - TEST-NET-3
  if (a >= 224) return true; // 224.0.0.0/4 multicast, 240.0.0.0/4 reserved, 255.255.255.255 broadcast
  return false;
}

// ============================================================================
// IPv6
// ============================================================================

/**
 * Expands an UNBRACKETED IPv6 literal (`"::1"`, not `"[::1]"`), lower-case
 * and `::`-compressed exactly as `URL.hostname` and `dns.lookup` both print
 * it, into its eight 16-bit groups. Returns `null` for anything this cannot
 * make sense of - malformed input, more than one `::`, or a group count that
 * does not add up to eight - and `null` is a REFUSAL everywhere this is
 * called from (see `isSpecialPurposeIpv6` below), not a pass-through: this
 * is the module's one explicit instance of "unclassifiable defaults closed"
 * for an address. There is deliberately no support for a dotted-quad IPv4
 * tail (`::ffff:127.0.0.1` written literally rather than as hex groups):
 * empirically both `URL.hostname` and `dns.lookup` always normalize that
 * tail to hex groups before this module ever sees it, so a parser that also
 * accepted the dotted form would be exercising a code path neither real
 * caller ever takes - the opposite of "checker and fetcher agree".
 */
export function parseIpv6Groups(address: string): number[] | null {
  const parts = address.split("::");
  if (parts.length > 2) {
    return null;
  }

  const sideGroups = (side: string): string[] => (side === "" ? [] : side.split(":"));

  let hexGroups: string[];
  if (parts.length === 2) {
    const left = sideGroups(parts[0]);
    const right = sideGroups(parts[1]);
    const zerosToInsert = 8 - left.length - right.length;
    if (zerosToInsert < 0) {
      return null;
    }
    hexGroups = [...left, ...(Array(zerosToInsert).fill("0") as string[]), ...right];
  } else {
    hexGroups = sideGroups(parts[0]);
  }

  if (hexGroups.length !== 8) {
    return null;
  }

  const numbers = hexGroups.map((g) => (g === "" ? 0 : Number.parseInt(g, 16)));
  return numbers.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff) ? null : numbers;
}

/**
 * Classifies an UNBRACKETED IPv6 literal as disallowed. Beyond the four
 * shapes the acceptance doc names outright (`::`, `::1`, `fc00::/7`,
 * `fe80::/10`), this also decodes three transition mechanisms that embed a
 * full IPv4 address in the low 32 bits - IPv4-mapped (`::ffff:a.b.c.d`), the
 * deprecated IPv4-compatible form (`::a.b.c.d`), and the NAT64 well-known
 * prefix (`64:ff9b::/96`, RFC 6052) - plus 6to4 (`2002::/16`, RFC 3056),
 * which embeds the address in bits 16-48 instead. In every one of those
 * cases the address actually dialled on the wire IS the embedded IPv4
 * address, so it is judged by the exact same `isSpecialPurposeIpv4` rule a
 * bare literal would get: an institution reachable at a genuinely public
 * address does not lose that status merely for being spelled through one of
 * these wrappers, and a private address does not gain a pass by being
 * spelled through one either. Two further transition mechanisms - Teredo
 * (`2001::/32`) and 6rd - are NOT decoded here; they are rare enough, and
 * decoding them ambiguous enough (Teredo's embedded address is obfuscated,
 * not stored plainly), that adding them would trade a real increase in
 * parsing complexity for a threat nobody has a documented real-world
 * exploit of. A future reader who does should extend this function, not
 * work around it.
 */
export function isSpecialPurposeIpv6(address: string): boolean {
  const groups = parseIpv6Groups(address);
  if (groups === null) {
    return true;
  }

  const isZero = (n: number) => n === 0;

  if (groups.every(isZero)) {
    return true; // :: - the unspecified address
  }
  if (groups.slice(0, 7).every(isZero) && groups[7] === 1) {
    return true; // ::1 - loopback
  }
  if ((groups[0] & 0xfe00) === 0xfc00) {
    return true; // fc00::/7 - unique local addresses, the IPv6 analogue of RFC1918
  }
  if ((groups[0] & 0xffc0) === 0xfe80) {
    return true; // fe80::/10 - link-local
  }

  const embeddedIpv4ToOctets = (high: number, low: number): Ipv4Octets => [
    (high >> 8) & 0xff,
    high & 0xff,
    (low >> 8) & 0xff,
    low & 0xff,
  ];

  const isCompatibleOrMapped =
    groups.slice(0, 5).every(isZero) && (groups[5] === 0 || groups[5] === 0xffff);
  const isNat64 =
    groups[0] === 0x0064 && groups[1] === 0xff9b && groups.slice(2, 6).every(isZero);
  if (isCompatibleOrMapped || isNat64) {
    return isSpecialPurposeIpv4(embeddedIpv4ToOctets(groups[6], groups[7]));
  }

  if (groups[0] === 0x2002) {
    return isSpecialPurposeIpv4(embeddedIpv4ToOctets(groups[1], groups[2]));
  }

  return false;
}

// ============================================================================
// The combined entry point the fetch layer dials against
// ============================================================================

/**
 * The single function `canvas-fetch.ts` calls for each address
 * `dns.promises.lookup(host, { all: true })` returns, so there is exactly
 * one place that decides how a `{ address, family }` pair maps onto the two
 * family-specific rules above. `family` is `dns.LookupAddress`'s own field:
 * `4` or `6` in the overwhelming majority of real answers, and `0` "is a
 * likely indicator of a bug in the name resolution service used by the
 * operating system" per Node's own documentation for that field - not a
 * value this module can classify with either rule above, and an
 * unclassifiable address is refused here exactly as an unclassifiable IPv6
 * literal is refused above: failing closed on the shape nobody enumerated
 * yet, rather than guessing.
 */
export function isSpecialPurposeAddress(address: string, family: number): boolean {
  if (family === 4) {
    const octets = parseIpv4(address);
    return octets === null ? true : isSpecialPurposeIpv4(octets);
  }
  if (family === 6) {
    return isSpecialPurposeIpv6(address);
  }
  return true;
}
