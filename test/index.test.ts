import { describe, expect, it } from "vitest";
import {
  EIGHTH_32ND,
  HALF_32ND,
  QUARTER_32ND,
  THIRTY_SECOND,
  change32nds,
  dollarValue,
  formatPrice,
  fromBps,
  parsePrice,
  roundToTick,
  tickValue,
  ticksBetween,
  toBps,
} from "../src/index.js";

describe("parsePrice", () => {
  it("parses whole 32nds", () => {
    expect(parsePrice("105-16")).toBe(105.5);
    expect(parsePrice("99-03")).toBe(99.09375);
    expect(parsePrice("99-3")).toBe(99.09375); // unpadded
    expect(parsePrice("100-00")).toBe(100);
    expect(parsePrice("0-01")).toBe(0.03125);
  });

  it("parses the plus (half a 32nd) — CME education examples", () => {
    // https://www.cmegroup.com/education/courses/introduction-to-treasuries/calculating-us-treasury-pricing
    expect(parsePrice("105-16+")).toBe(105.515625);
    expect(parsePrice("99-03+")).toBe(99.109375);
  });

  it("parses eighths digits (cash-market convention)", () => {
    expect(parsePrice("104-072")).toBe(104 + 7.25 / 32);
    expect(parsePrice("105-162")).toBe(105 + 16.25 / 32);
    expect(parsePrice("105-164")).toBe(105.515625); // 4/8 == "+"
    expect(parsePrice("105-166")).toBe(105 + 16.75 / 32);
    expect(parsePrice("105-167")).toBe(105 + 16.875 / 32);
    expect(parsePrice("105-160")).toBe(105.5);
  });

  it("parses unicode fraction glyphs", () => {
    expect(parsePrice("105-16½")).toBe(105.515625);
    expect(parsePrice("105-16¼")).toBe(105 + 16.25 / 32);
    expect(parsePrice("105-16⅞")).toBe(105 + 16.875 / 32);
  });

  it("parses explicit fractional 32nds", () => {
    expect(parsePrice("105-16.25")).toBe(105 + 16.25 / 32);
    expect(parsePrice("105-16.5")).toBe(105.515625);
  });

  it("parses CME futures style", () => {
    expect(parsePrice("110'160", { style: "cme" })).toBe(110.5);
    expect(parsePrice("110'162", { style: "cme" })).toBe(110 + 16.25 / 32);
    expect(parsePrice("110'165", { style: "cme" })).toBe(110.515625);
    expect(parsePrice("110'167", { style: "cme" })).toBe(110 + 16.75 / 32);
    expect(parsePrice("110'16+", { style: "cme" })).toBe(110.515625);
  });

  it("accepts -, ', and : separators, with whitespace", () => {
    expect(parsePrice("105'16")).toBe(105.5);
    expect(parsePrice("105:16")).toBe(105.5);
    expect(parsePrice("105 - 16+")).toBe(105.515625);
  });

  it("parses signed quotes (price changes)", () => {
    expect(parsePrice("-0-08+")).toBe(-0.265625);
    expect(parsePrice("+0-08")).toBe(0.25);
  });

  it("rejects malformed quotes", () => {
    expect(() => parsePrice("105-32")).toThrow(RangeError); // 32nds > 31
    expect(() => parsePrice("105.16")).toThrow(RangeError); // '.' is not a separator
    expect(() => parsePrice("105-168")).toThrow(RangeError); // eighth digit > 7
    expect(() => parsePrice("105-16++")).toThrow(RangeError);
    expect(() => parsePrice("105'163", { style: "cme" })).toThrow(RangeError); // not 0/2/5/7
    expect(() => parsePrice("abc")).toThrow(RangeError);
    expect(() => parsePrice("105")).toThrow(RangeError); // bare number: use Number()
  });
});

describe("formatPrice", () => {
  it("formats whole 32nds, padded by default", () => {
    expect(formatPrice(105.5)).toBe("105-16");
    expect(formatPrice(99.09375)).toBe("99-03");
    expect(formatPrice(99.09375, { pad: false })).toBe("99-3");
    expect(formatPrice(100)).toBe("100-00");
  });

  it("formats halves as plus, eighths as digits", () => {
    expect(formatPrice(105.515625)).toBe("105-16+");
    expect(formatPrice(105.515625, { plus: false })).toBe("105-164");
    expect(formatPrice(104 + 7.25 / 32)).toBe("104-072");
    expect(formatPrice(105 + 16.875 / 32)).toBe("105-167");
  });

  it("formats CME style with an always-present fraction digit", () => {
    expect(formatPrice(110.5, { style: "cme" })).toBe("110'160");
    expect(formatPrice(110 + 16.25 / 32, { style: "cme" })).toBe("110'162");
    expect(formatPrice(110.515625, { style: "cme" })).toBe("110'165");
    expect(formatPrice(110 + 16.75 / 32, { style: "cme" })).toBe("110'167");
  });

  it("supports custom separators and negatives", () => {
    expect(formatPrice(105.5, { sep: ":" })).toBe("105:16");
    expect(formatPrice(-0.265625)).toBe("-0-08+");
  });

  it("rounds to the style's resolution", () => {
    expect(formatPrice(105.5 + 1 / 512)).toBe("105-161"); // halfway → rounds up to 1/256
    expect(formatPrice(105.500001)).toBe("105-16");
    expect(() => formatPrice(Number.NaN)).toThrow(RangeError);
    expect(() => formatPrice(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it("round-trips every 1/256 increment exactly", () => {
    for (let i = 0; i < 256 * 2; i++) {
      const price = 99 + i / 256;
      expect(parsePrice(formatPrice(price))).toBe(price);
    }
  });

  it("round-trips every 1/128 increment in CME style", () => {
    for (let i = 0; i < 128; i++) {
      const price = 110 + i / 128;
      expect(parsePrice(formatPrice(price, { style: "cme" }), { style: "cme" })).toBe(price);
    }
  });
});

describe("ticks, bps, and dollar values", () => {
  it("counts ticks between prices", () => {
    expect(ticksBetween(99.5, 99.75)).toBe(8);
    expect(ticksBetween(99.75, 99.5)).toBe(-8);
    expect(ticksBetween(110.5, 110.515625, HALF_32ND)).toBe(1);
    expect(ticksBetween(110.5, 110.5078125, QUARTER_32ND)).toBe(1);
  });

  it("rounds to tick", () => {
    expect(roundToTick(99.51)).toBe(99.5);
    expect(roundToTick(99.52, THIRTY_SECOND)).toBe(99.53125);
    expect(roundToTick(99.51, EIGHTH_32ND)).toBe(99.51171875);
  });

  it("expresses moves in 32nds and bps", () => {
    expect(change32nds(99.5, 99.75)).toBe(8);
    expect(toBps(0.0025)).toBe(25);
    expect(fromBps(25)).toBe(0.0025);
  });

  it("computes dollar values", () => {
    expect(tickValue(1_000_000)).toBe(312.5); // the desk classic
    expect(tickValue(100_000, HALF_32ND)).toBe(15.625); // ZN tick
    expect(dollarValue(105.515625, 1_000_000)).toBe(1_055_156.25);
  });
});
