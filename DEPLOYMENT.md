# Deployment

- Repository: `NicJMurray/housing`
- Production branch: `main`
- Cloudflare account: `22c1482ec05957092be7a2df424c4543`
- Pages project: `housing`
- Custom domain: `finance.njmurray.com`
- Build command: `npm run build`
- Native Git deployment: Cloudflare Pages builds and publishes `dist/` after a push.
- Assets: `dist/` only; no Worker script or runtime database is required.

`wrangler.jsonc` is the source of truth for the Pages project name and public asset directory. The homepage remains in `NicJMurray/homepage` and links here from its Finance section. A change to this app should not require rebuilding the homepage.

## Automatic builds

Cloudflare Pages projects Builds connects the GitHub repository to `housing`. The production integration watches `main`, runs the build, and deploys the exact commit. The integration uses the existing authorized Cloudflare GitHub App; no deployment token is stored in this repository. The Cloudflare GitHub App must be allowed access to this repository.

After a push, check Cloudflare's build and deployed commit, then verify the ordinary custom domain serves the expected page and assets. Do not claim a Git pipeline works based solely on a source push, a saved configuration or a manual upload.

## Manual recovery

With an authorized Cloudflare deployment credential configured securely:

```sh
npm install
npm run build
npm run deploy
```

Manual recovery is independent of the ongoing Git build connection. Never paste a token into a command, file, README or issue. Only public example defaults should be committed; private settings links remain outside source control.

The Cloudflare project origin is `https://housing-bmt.pages.dev/`. The canonical public URL is `https://finance.njmurray.com/`; the native Git integration watches `main` in `NicJMurray/housing`.
