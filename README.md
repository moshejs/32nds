# 32nds

US Treasury price math for JavaScript/TypeScript — parse and format **32nds quotes** (`105-16+`, `110'165`), count **ticks**, convert **basis points**, and compute **dollar values**. Zero dependencies.

```
npm install 32nds
```

## Why

Treasuries don't trade in decimals. A 10-year note is quoted like `105-16+`: a handle of 105 points, 16 thirty-seconds, plus half a 32nd — 105.515625% of par. Every fixed-income UI, blotter, and P&L report has to translate between that notation and numbers, and npm had nothing for it: bond *analytics* libraries compute yield and duration, but none of them can read a price the way the market writes it.

`32nds` does exactly that one job, correctly:

```ts
import { parsePrice, formatPrice, tickValue } from "32nds";

parsePrice("105-16+");                    // 105.515625
parsePrice("104-072");                    // 104.2265625  (7¼ 32nds)
parsePrice("110'165", { style: "cme" });  // 110.515625   (futures display)

formatPrice(99.109375);                   // "99-03+"
formatPrice(110.5, { style: "cme" });     // "110'160"

tickValue(1_000_000);                     // 312.50 — a 32nd on $1MM face
```

A nice property: Treasury fractions are dyadic rationals (powers of two), so every value here is **exact** in IEEE 754 floating point. No decimal library, no epsilon comparisons.

## Conventions handled

| Notation | Meaning | Decimal |
| --- | --- | --- |
| `105-16` | 105 + 16/32 | 105.50 |
| `105-16+` | + half a 32nd (1/64) | 105.515625 |
| `104-072` | trailing digit = eighths of a 32nd (cash market) | 104.2265625 |
| `105-16½` | unicode fractions accepted | 105.515625 |
| `110'165` | CME futures: 2/5/7 = ¼/½/¾ of a 32nd | 110.515625 |
| `-0-08+` | signed quotes (price changes) | −0.265625 |

Separators `-`, `'`, and `:` are accepted. A decimal point is deliberately **not** a separator: `parsePrice("105.16")` throws instead of silently reading 16/32 — decimals are already numbers.

## API

### `parsePrice(quote, opts?) → number`

Quote string → percent-of-par number. `opts.style`: `"eighths"` (default, cash-market: trailing digit 0–7 is eighths of a 32nd) or `"cme"` (futures: 0/2/5/7 = 0/¼/½/¾). Throws `RangeError` on malformed input, 32nds ≥ 32, or invalid fraction digits.

### `formatPrice(price, opts?) → string`

Number → quote string. Rounds to the style's resolution first (1/256 eighths, 1/128 cme).

- `style` — `"eighths"` (default) or `"cme"` (always renders the fraction digit, like Globex: `110'160`)
- `sep` — separator; defaults `"-"` (eighths) / `"'"` (cme)
- `plus` — render half a 32nd as `"+"` (default `true`)
- `pad` — two-digit 32nds, `99-03` (default `true`)

### Ticks and values

- `ticksBetween(from, to, tick?)` — signed tick count between two prices (default tick 1/32)
- `roundToTick(price, tick?)` — snap a price to the nearest tick
- `change32nds(from, to)` — a move expressed in 32nds
- `toBps(decimal)` / `fromBps(bps)` — basis-point conversion (`toBps(0.0025)` → 25)
- `dollarValue(price, face)` — dollar value of a price on a face amount
- `tickValue(face, tick?)` — dollar value of one tick (`tickValue(1_000_000)` → 312.50)

### Tick constants

`THIRTY_SECOND` (1/32, cash tick), `HALF_32ND` (1/64, ZN futures), `QUARTER_32ND` (1/128, ZF/ZT futures), `EIGHTH_32ND` (1/256, cash quote resolution).

## References

- [CME Group — Calculating U.S. Treasury Pricing](https://www.cmegroup.com/education/courses/introduction-to-treasuries/calculating-us-treasury-pricing)
- [CME Group — Treasury Futures Price Rounding Conventions](https://www.cmegroup.com/trading/interest-rates/files/treasury-futures-price-rounding-conventions-2020.pdf)

## Author

Built by **[Moshe Malka](https://moshemalka.com)** — engineering leader in New York City. Studio work at [Quentin.Code](https://www.quentin.software/).

MIT © Moshe Malka
