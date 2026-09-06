import { describe, expect, it } from "vitest";
import {
  isSpecialPurposeAddress,
  isSpecialPurposeIpv4,
  isSpecialPurposeIpv6,
  parseIpv4,
  parseIpv6Groups,
} from "./lms-address-rules";

/**
 * Direct tests of the extracted address classifier (docs/lms-credentials-
 * acceptance-criteria.md, E-ARCH5). These pin the actual boundary values of
 * each reserved range against literal octet/hex-group tuples this file
 * writes out by hand - NOT against `validateLmsBaseUrl` or any other
 * consumer. A test that instead compared this module's output to
 * `lms-credential-rules.ts`'s output would pass by construction and prove
 * nothing (the exact tautology E-ARCH5 forbids, and this repo has shipped
 * twice) - if this module and its caller silently drifted apart, a
 * self-comparison test would still stay green. Pinning literal values here
 * is what would actually catch that drift.
 */

describe("parseIpv4", () => {
  it("parses a well-formed dotted-decimal address", () => {
    expect(parseIpv4("192.168.1.1")).toEqual([192, 168, 1, 1]);
    expect(parseIpv4("0.0.0.0")).toEqual([0, 0, 0, 0]);
    expect(parseIpv4("255.255.255.255")).toEqual([255, 255, 255, 255]);
  });

  it("refuses anything that is not exactly four 1-3 digit groups", () => {
    for (const input of ["1.2.3", "1.2.3.4.5", "1.2.3.256", "a.b.c.d", "", "1.2.3.-4"]) {
      expect(parseIpv4(input), `${JSON.stringify(input)} must not parse`).toBeNull();
    }
  });

  it("refuses an out-of-range octet defensively", () => {
    // URL's own parser already rejects this before it reaches this module in
    // practice, but the function itself must not silently accept it.
    expect(parseIpv4("256.1.1.1")).toBeNull();
    expect(parseIpv4("1.999.1.1")).toBeNull();
  });
});

describe("isSpecialPurposeIpv4 - the named ranges", () => {
  it("refuses the whole loopback block, not only 127.0.0.1", () => {
    expect(isSpecialPurposeIpv4([127, 0, 0, 1])).toBe(true);
    expect(isSpecialPurposeIpv4([127, 255, 255, 254])).toBe(true);
  });

  it("refuses both metadata addresses via the link-local block", () => {
    expect(isSpecialPurposeIpv4([169, 254, 169, 254])).toBe(true);
    expect(isSpecialPurposeIpv4([169, 254, 170, 2])).toBe(true);
  });

  it("refuses all three RFC1918 blocks at their exact edges", () => {
    expect(isSpecialPurposeIpv4([10, 0, 0, 0])).toBe(true);
    expect(isSpecialPurposeIpv4([10, 255, 255, 255])).toBe(true);
    expect(isSpecialPurposeIpv4([172, 16, 0, 0])).toBe(true);
    expect(isSpecialPurposeIpv4([172, 31, 255, 255])).toBe(true);
    expect(isSpecialPurposeIpv4([192, 168, 0, 0])).toBe(true);
    expect(isSpecialPurposeIpv4([192, 168, 255, 255])).toBe(true);
  });

  it("refuses carrier-grade NAT, 100.64.0.0/10, at its exact edges", () => {
    expect(isSpecialPurposeIpv4([100, 63, 255, 255])).toBe(false); // just below the block
    expect(isSpecialPurposeIpv4([100, 64, 0, 0])).toBe(true);
    expect(isSpecialPurposeIpv4([100, 127, 255, 255])).toBe(true);
    expect(isSpecialPurposeIpv4([100, 128, 0, 0])).toBe(false); // just above the block
  });

  it("refuses the TEST-NET and benchmarking blocks", () => {
    expect(isSpecialPurposeIpv4([192, 0, 2, 1])).toBe(true); // TEST-NET-1
    expect(isSpecialPurposeIpv4([198, 51, 100, 1])).toBe(true); // TEST-NET-2
    expect(isSpecialPurposeIpv4([203, 0, 113, 1])).toBe(true); // TEST-NET-3
    expect(isSpecialPurposeIpv4([198, 18, 0, 1])).toBe(true); // benchmarking
    expect(isSpecialPurposeIpv4([198, 19, 255, 255])).toBe(true); // benchmarking
  });

  it("refuses 6to4 relay anycast and IETF protocol assignments", () => {
    expect(isSpecialPurposeIpv4([192, 88, 99, 1])).toBe(true);
    expect(isSpecialPurposeIpv4([192, 0, 0, 8])).toBe(true);
  });

  it("refuses multicast, reserved and broadcast (224.0.0.0 and above)", () => {
    expect(isSpecialPurposeIpv4([224, 0, 0, 1])).toBe(true);
    expect(isSpecialPurposeIpv4([240, 0, 0, 1])).toBe(true);
    expect(isSpecialPurposeIpv4([255, 255, 255, 255])).toBe(true);
  });

  it("accepts a public address that merely sits next to a private block", () => {
    // 172.32.x is one above the RFC1918 172.16.0.0/12 block; 11.x is one
    // above the RFC1918 10.0.0.0/8 block. A prefix-match bug refuses these.
    expect(isSpecialPurposeIpv4([172, 32, 0, 1])).toBe(false);
    expect(isSpecialPurposeIpv4([172, 15, 255, 255])).toBe(false);
    expect(isSpecialPurposeIpv4([11, 0, 0, 1])).toBe(false);
    expect(isSpecialPurposeIpv4([9, 255, 255, 255])).toBe(false);
  });

  it("accepts ordinary public addresses", () => {
    expect(isSpecialPurposeIpv4([93, 184, 216, 34])).toBe(false); // example.com
    expect(isSpecialPurposeIpv4([8, 8, 8, 8])).toBe(false);
  });
});

describe("parseIpv6Groups", () => {
  it("expands a fully-written address with no compression", () => {
    expect(parseIpv6Groups("2001:db8:0:0:0:0:0:1")).toEqual([0x2001, 0xdb8, 0, 0, 0, 0, 0, 1]);
  });

  it("expands :: at the start, middle and end", () => {
    expect(parseIpv6Groups("::1")).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIpv6Groups("::")).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(parseIpv6Groups("2001:db8::")).toEqual([0x2001, 0xdb8, 0, 0, 0, 0, 0, 0]);
    expect(parseIpv6Groups("fe80::1")).toEqual([0xfe80, 0, 0, 0, 0, 0, 0, 1]);
  });

  it("refuses more than one :: compression", () => {
    expect(parseIpv6Groups("2001::db8::1")).toBeNull();
  });

  it("refuses a group count that does not add up to eight", () => {
    expect(parseIpv6Groups("1:2:3:4:5:6:7")).toBeNull(); // seven groups, no ::
    expect(parseIpv6Groups("1:2:3:4:5:6:7:8:9")).toBeNull(); // nine groups
  });

  it("refuses a non-hex group", () => {
    expect(parseIpv6Groups("gggg::1")).toBeNull();
  });
});

describe("isSpecialPurposeIpv6", () => {
  it("refuses the unspecified address and loopback", () => {
    expect(isSpecialPurposeIpv6("::")).toBe(true);
    expect(isSpecialPurposeIpv6("::1")).toBe(true);
  });

  it("refuses unique-local (fc00::/7) across both halves of the block", () => {
    expect(isSpecialPurposeIpv6("fc00::1")).toBe(true);
    expect(isSpecialPurposeIpv6("fd00::1")).toBe(true);
  });

  it("refuses link-local (fe80::/10)", () => {
    expect(isSpecialPurposeIpv6("fe80::1")).toBe(true);
    expect(isSpecialPurposeIpv6("febf::1")).toBe(true);
  });

  it("accepts an ordinary public IPv6 address", () => {
    expect(isSpecialPurposeIpv6("2606:2800:220:1:248:1893:25c8:1946")).toBe(false); // example.com
  });

  it("decodes an IPv4-mapped address and judges the embedded IPv4", () => {
    // Written in hex-group form, exactly as URL.hostname and dns.lookup both
    // normalize an IPv4-mapped literal - 127.0.0.1 is 0x7f000001, i.e. groups
    // 7f00:0001; 93.184.216.34 (example.com) is 0x5db8d822, i.e. 5db8:d822.
    expect(isSpecialPurposeIpv6("::ffff:7f00:1")).toBe(true);
    expect(isSpecialPurposeIpv6("::ffff:5db8:d822")).toBe(false);
  });

  it("decodes an IPv4-compatible address (deprecated form) the same way", () => {
    expect(isSpecialPurposeIpv6("::7f00:1")).toBe(true); // ::127.0.0.1
    expect(isSpecialPurposeIpv6("::a00:1")).toBe(true); // ::10.0.0.1 (RFC1918)
  });

  it("decodes NAT64 (64:ff9b::/96) and judges the embedded IPv4", () => {
    expect(isSpecialPurposeIpv6("64:ff9b::7f00:1")).toBe(true); // embeds 127.0.0.1
    expect(isSpecialPurposeIpv6("64:ff9b::5db8:d822")).toBe(false); // embeds 93.184.216.34
  });

  it("decodes 6to4 (2002::/16) and judges the embedded IPv4", () => {
    expect(isSpecialPurposeIpv6("2002:7f00:1::")).toBe(true); // embeds 127.0.0.1
    expect(isSpecialPurposeIpv6("2002:5db8:d822::")).toBe(false); // embeds 93.184.216.34
  });

  it("refuses anything it cannot parse, failing closed", () => {
    expect(isSpecialPurposeIpv6("not-an-address")).toBe(true);
    expect(isSpecialPurposeIpv6("1:2:3:4:5:6:7")).toBe(true);
  });
});

describe("isSpecialPurposeAddress - the family-dispatching entry point canvas-fetch.ts calls", () => {
  it("dispatches family 4 to the IPv4 rules", () => {
    expect(isSpecialPurposeAddress("127.0.0.1", 4)).toBe(true);
    expect(isSpecialPurposeAddress("93.184.216.34", 4)).toBe(false);
  });

  it("dispatches family 6 to the IPv6 rules", () => {
    expect(isSpecialPurposeAddress("::1", 6)).toBe(true);
    expect(isSpecialPurposeAddress("2606:2800:220:1:248:1893:25c8:1946", 6)).toBe(false);
  });

  it("refuses an unrecognized family rather than guessing", () => {
    // dns.lookup's own docs: family 0 "is a likely indicator of a bug in the
    // name resolution service used by the operating system" - not a value
    // either family-specific rule can classify, so it must fail closed.
    expect(isSpecialPurposeAddress("93.184.216.34", 0)).toBe(true);
  });

  it("refuses a family-4 entry whose address does not actually parse as IPv4", () => {
    // Defensive: if dns.lookup ever reported family 4 with a malformed
    // address, this must refuse rather than throw or silently pass.
    expect(isSpecialPurposeAddress("not-an-ip", 4)).toBe(true);
  });
});
