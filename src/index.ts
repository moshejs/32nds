/**
 * 32nds — US Treasury price math.
 *
 * Prices are plain numbers in percent-of-par (e.g. 105.515625 for "105-16+").
 * Treasury fractions are dyadic rationals (powers of two), so every value in
 * this library is exact in IEEE 754 floating point — no decimal library needed.
 */

export type QuoteStyle = "eighths" | "cme";

export interface ParseOptions {
  /**
   * How to read a trailing digit after the 32nds.
   * - `"eighths"` (default, cash-market convention): digit 0–7 is eighths of
   *   a 32nd, so `104-072` = 104 + 7.25/32.
   * - `"cme"` (futures display): 2/5/7 mean ¼/½/¾ of a 32nd, so
   *   `110'165` = 110 + 16.5/32.
   */
  style?: QuoteStyle;
}

export interface FormatOptions {
  /** Same conventions as {@link ParseOptions.style}. Default `"eighths"`. */
  style?: QuoteStyle;
  /** Separator between handle and 32nds. Defaults: `"-"` (eighths), `"'"` (cme). */
  sep?: string;
  /** In eighths style, render half a 32nd as `"+"` instead of `"4"`. Default true. */
  plus?: boolean;
  /** Pad the 32nds to two digits (`99-03`, not `99-3`). Default true. */
  pad?: boolean;
}

/** One 32nd of a point (0.03125) — the cash Treasury tick. */
export const THIRTY_SECOND = 1 / 32;
/** Half a 32nd (1/64) — the 10-year note futures (ZN) tick. */
export const HALF_32ND = 1 / 64;
/** A quarter of a 32nd (1/128) — the 2- and 5-year futures (ZT/ZF) tick. */
export const QUARTER_32ND = 1 / 128;
/** An eighth of a 32nd (1/256) — the finest cash-market quote resolution. */
export const EIGHTH_32ND = 1 / 256;

const EIGHTH_GLYPHS: Record<string, number> = {
  "⅛": 1,
  "¼": 2,
  "⅜": 3,
  "½": 4,
  "⅝": 5,
  "¾": 6,
  "⅞": 7,
};

const CME_DIGIT_TO_EIGHTHS: Record<string, number> = { "0": 0, "2": 2, "5": 4, "7": 6 };
const EIGHTHS_TO_CME_DIGIT: Record<number, string> = { 0: "0", 2: "2", 4: "5", 6: "7" };

const QUOTE_RE = /^([+-]?)(\d+)\s*[-':]\s*(\d{1,2})(.*)$/;

/**
 * Parse a Treasury quote into a percent-of-par number.
 *
 * ```ts
 * parsePrice("105-16")   // 105.5
 * parsePrice("105-16+")  // 105.515625
 * parsePrice("104-072")  // 104.2265625   (7.25/32nds)
 * parsePrice("105-16½")  // 105.515625
 * parsePrice("110'165", { style: "cme" }) // 110.515625
 * parsePrice("-0-08+")   // -0.265625     (a price change)
 * ```
 *
 * Accepted separators: `-`, `'`, `:`. A decimal point is deliberately NOT a
 * separator — `"105.16"` throws rather than silently meaning 105 + 16/32.
 */
export function parsePrice(quote: string, opts: ParseOptions = {}): number {
  const style = opts.style ?? "eighths";
  const m = QUOTE_RE.exec(quote.trim());
  if (!m) throw new RangeError(`Cannot parse price quote: "${quote}"`);
  const [, sign, handleStr, t32Str, restRaw] = m;
  const t32 = Number(t32Str);
  if (t32 > 31) throw new RangeError(`32nds must be 0–31 in "${quote}", got ${t32}`);
  const rest = (restRaw as string).trim();

  let eighths: number;
  if (rest === "") {
    eighths = 0;
  } else if (rest === "+") {
    eighths = 4;
  } else if (rest in EIGHTH_GLYPHS) {
    eighths = EIGHTH_GLYPHS[rest] as number;
  } else if (/^\.\d+$/.test(rest)) {
    // Explicit fractional 32nds, e.g. "105-16.25"
    eighths = Number(`0${rest}`) * 8;
  } else if (/^[0-7]$/.test(rest)) {
    if (style === "cme") {
      const e = CME_DIGIT_TO_EIGHTHS[rest];
      if (e === undefined) {
        throw new RangeError(
          `Invalid CME fraction digit "${rest}" in "${quote}" (expected 0, 2, 5, or 7)`,
        );
      }
      eighths = e;
    } else {
      eighths = Number(rest);
    }
  } else {
    throw new RangeError(`Cannot parse fraction "${rest}" in quote "${quote}"`);
  }

  const value = Number(handleStr) + (t32 + eighths / 8) / 32;
  return sign === "-" ? -value : value;
}

/**
 * Format a percent-of-par number as a Treasury quote.
 *
 * ```ts
 * formatPrice(105.515625)                   // "105-16+"
 * formatPrice(104.2265625)                  // "104-072"
 * formatPrice(110.515625, { style: "cme" }) // "110'165"
 * formatPrice(105.515625, { plus: false })  // "105-164"
 * ```
 *
 * Values are rounded to the style's resolution first (1/256 for eighths,
 * 1/128 for cme). CME style always renders the fraction digit (`110'160`),
 * matching Globex displays.
 */
export function formatPrice(price: number, opts: FormatOptions = {}): string {
  if (!Number.isFinite(price)) {
    throw new RangeError(`Cannot format non-finite price: ${price}`);
  }
  const style = opts.style ?? "eighths";
  const sep = opts.sep ?? (style === "cme" ? "'" : "-");
  const plus = opts.plus ?? true;
  const pad = opts.pad ?? true;

  const unitsPerPoint = style === "cme" ? 128 : 256;
  const neg = price < 0;
  let units = Math.round(Math.abs(price) * unitsPerPoint);
  const handle = Math.floor(units / unitsPerPoint);
  units -= handle * unitsPerPoint;
  const unitsPer32 = unitsPerPoint / 32;
  const t32 = Math.floor(units / unitsPer32);
  const eighths = (units - t32 * unitsPer32) * (style === "cme" ? 2 : 1);

  let tail: string;
  if (style === "cme") {
    tail = EIGHTHS_TO_CME_DIGIT[eighths] as string;
  } else if (eighths === 0) {
    tail = "";
  } else if (eighths === 4 && plus) {
    tail = "+";
  } else {
    tail = String(eighths);
  }

  const t32Str = pad ? String(t32).padStart(2, "0") : String(t32);
  return `${neg ? "-" : ""}${handle}${sep}${t32Str}${tail}`;
}

/**
 * Signed number of ticks from one price to another. Default tick is 1/32.
 *
 * ```ts
 * ticksBetween(99.5, 99.75)              // 8
 * ticksBetween(110.5, 110.484375, HALF_32ND) // -1
 * ```
 */
export function ticksBetween(from: number, to: number, tick: number = THIRTY_SECOND): number {
  return Math.round((to - from) / tick);
}

/** Round a price to the nearest tick (default 1/32). */
export function roundToTick(price: number, tick: number = THIRTY_SECOND): number {
  return Math.round(price / tick) * tick;
}

/** Price move expressed in 32nds: `change32nds(99.5, 99.75)` → 8. */
export function change32nds(from: number, to: number): number {
  return (to - from) * 32;
}

/** Decimal fraction → basis points: `toBps(0.0025)` → 25. */
export function toBps(decimal: number): number {
  return decimal * 10_000;
}

/** Basis points → decimal fraction: `fromBps(25)` → 0.0025. */
export function fromBps(bps: number): number {
  return bps / 10_000;
}

/**
 * Dollar value of a percent-of-par price on a face amount.
 * `dollarValue(105.515625, 1_000_000)` → 1,055,156.25
 */
export function dollarValue(price: number, face: number): number {
  return (price / 100) * face;
}

/**
 * Dollar value of one tick on a face amount. The desk classic:
 * `tickValue(1_000_000)` → 312.50 (a 32nd on $1MM face).
 */
export function tickValue(face: number, tick: number = THIRTY_SECOND): number {
  return (tick / 100) * face;
}
