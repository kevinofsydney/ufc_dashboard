# Repository instructions

- Read `README.md` for orientation and `docs/product-spec.md` for the product contract before changing the application.
- Read `docs/implementation-status.md` before claiming the MVP is production-ready.
- The feature set is implemented and locally verified; production/preview activation and the listed acceptance hardening remain incomplete as of 17 July 2026.
- Install project dependencies and caches only inside this repository.
- During the current build, do not delete files or directories. If a change appears to require deletion, stop and report it instead.
- Never change allocation, odds conversion, consensus, settlement, or ROI maths without updating boundary tests.
- Keep prompts and D1 migrations versioned. Never edit an applied migration in place.
- Never write secrets, credentials, production transcripts, or production data to the repository.
- Before committing application changes, run `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run format:check`, `npm.cmd test`, the relevant Playwright journey, and `npm.cmd run build`.
- Preserve unrelated work and prefer small, focused changes.
- Production data and production D1 bindings must never be used by preview deployments.
- Do not enable `CLOUDFLARE_DEPLOY_ENABLED` until the release blockers in `docs/cloudflare-setup.md` are complete.
- `docs/implementation-status.md` is the single source of truth for completed, remaining, and post-MVP status. Other documents link to it instead of restating status; do not add status prose or test/migration counts elsewhere.
