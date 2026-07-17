# Repository instructions

- Read `README.md` before changing the application.
- Install project dependencies and caches only inside this repository.
- During the current build, do not delete files or directories. If a change appears to require deletion, stop and report it instead.
- Never change allocation, odds conversion, consensus, settlement, or ROI maths without updating boundary tests.
- Keep prompts and D1 migrations versioned. Never edit an applied migration in place.
- Never write secrets, credentials, production transcripts, or production data to the repository.
- Run typecheck, lint, tests, and the production build before committing.
- Preserve unrelated work and prefer small, focused changes.
- Production data and production D1 bindings must never be used by preview deployments.
