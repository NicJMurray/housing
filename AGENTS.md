# Housing simulator

- This repository owns the housing simulator at `finance.njmurray.com`, a Cloudflare Pages project named `housing`. The homepage at `njmurray.com` is a separate repository and links to this app from its Finance section.
- Read `README.md` and `DEPLOYMENT.md` before editing hosting. Preserve the existing domain and Pages project identity.
- Keep the pure financial model in `dist/engine.js` independent of UI code. Currency stays unrounded until presentation.
- Keep the three scenarios, same starting capital/income, monthly cash-flow convention, value-linked equity loan and after-sale net-worth reconciliation intact.
- All committed defaults and documentation must describe an illustrative example profile. Never add a real person's salary, rent, savings, private settings link, original private-site configuration or screenshots containing their actual profile to this public repository.
- Existing ISA capital is not a fresh subscription. Overflow contributions go into a taxable account. Mortgage principal is not an unrecoverable expense. Do not silently invent credit for shortfalls.
- Separate inside-flat maintenance from communal service charges/reserves. Extra major works are net of reserve support. Announced scheme eligibility and unpublished repayment details remain provisional.
- Run `npm run build` before publishing. It checks JavaScript, all financial tests, the asset allowlist and Pages configuration. Only `dist/` is public; tests, docs and dependencies remain outside it.
- Publish validated changes to `main` only when the user's task authorizes publication. Preserve unrelated commits; use fast-forward updates with the expected branch SHA, never force-push.
- Verify an automatic build for the exact pushed SHA and confirm the live custom domain's content. A manual upload alone does not establish Git auto-deployment.
- Keep credentials in protected Cloudflare/GitHub settings. Never commit API tokens, `.env`, `.dev.vars`, or build secrets.
