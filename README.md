# Home / Portfolio

A responsive UK rent-versus-buy-versus-invest simulator, listed under **Finance** on [njmurray.com](https://njmurray.com/#finance).

Production address: **https://finance.njmurray.com/**. Source: `NicJMurray/housing`. Hosting: Cloudflare Pages project, `housing`.

Compare a shared rental with investing, an older Southwark flat, and a new-build flat financed using the announced Your First Home equity loan. Explore 5–15 years from a common September 2027 start, monthly affordability, after-sale wealth, real wealth, stress presets, break-even conditions and a sensitivity heatmap. Every scenario invests monthly surplus and pays all upfront costs from the same capital.

The public page starts with **illustrative example figures**, not a real person's finances. Visitors' changes are stored only in their browser. Optional settings links encode inputs in the URL fragment, which is not sent in HTTP requests; anyone given the link can read those inputs. There are no analytics, accounts, server-side financial records or external runtime scripts.

## Development

Node 22 or newer is recommended.

```sh
npm install
npm run build
npm run dev
```

This project reuses the existing Pages Git integration, the same deployment path as the homepage. It does not require a separate Workers Builds credential.

The production assets are already plain HTML/CSS/JavaScript in `dist/`. The build checks syntax, runs the financial tests, validates the asset allowlist and checks the Pages configuration. No frontend bundler is needed.

| Path | Purpose |
| --- | --- |
| `dist/engine.js` | Pure monthly financial model and assumptions |
| `dist/app.js` | Controls, charts, persistence, sharing and CSV exports |
| `dist/index.html`, `dist/styles.css` | Responsive interface |
| `dist/_headers` | Asset, privacy and cache headers |
| `tests/engine.test.mjs` | Financial verification and independent balance-sheet reconciliation |
| `scripts/validate-assets.mjs` | Public output and deployment checks |
| `wrangler.jsonc` | Assets-only Pages configuration |
| `DEPLOYMENT.md` | Publishing setup and verification |

## Model conventions

Final wealth is property value less the bank mortgage, current government equity share and sale costs, plus ISA and taxable investments after estimated liquidation tax, less any unfunded spending. Mortgage principal is reflected once, as a lower mortgage balance. Negative equity is not hidden by flooring sale proceeds.

Salary grows on September anniversaries; net pay uses annualised English income tax and NI, with a configurable calibration to starting take-home. Pension salary sacrifice and student-loan deductions are optional; pension assets are excluded in every scenario. Future tax bands and allowances are extrapolations, not promised future legislation.

Investments compound monthly using the effective annual total return, before end-month contributions/withdrawals. ISA room resets at a monthly April boundary approximating 6 April. Existing ISA capital is exempt from new subscription limits. Taxable overflow models reinvested after-tax dividends, pooled capital-gain basis, exemptions and final liquidation; it excludes automatic tax harvesting, bed-and-ISA and other investment income.

Mortgage repayments split interest and principal. Refinancing starts in the month after the fixed period ends and preserves the original remaining term. The government loan accrues interest on its nominal amount while redemption follows its current percentage of home value, sharing both appreciation and depreciation. Its interest stages and provisional operational details are documented in the app.

Service charges and expected inside-flat maintenance are distinct; extra major works must be net of reserve support. If liquid assets run out, the path is marked unfinanceable and an explicit unfunded liability preserves the arithmetic without inventing a lending facility.

Every plotted snapshot is after assumed property sale and investment liquidation. Real wealth is in October 2026 purchasing power, including the interval to the September 2027 start. Detailed cash-flow ledgers remain nominal. Renting a room and owning a private flat provide different living standards; the model assigns no arbitrary price to that difference.

Rules and sources were checked 28 October 2026 and are linked in **Method & sources**. Property returns, investment returns, mortgage rates and property-specific fees are editable illustrations. The app is not a mortgage offer or personalised financial advice.
