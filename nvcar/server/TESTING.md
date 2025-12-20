# Testing

This document describes how to run the test suite locally.

Prerequisites:
- Node.js 18+
- npm

Install dependencies:

```
cd nvcar/server
npm ci
```

Unit & integration tests (Jest + mongodb-memory-server):

```
npm test
```

Best practices & runbook notes:

- Use `mongodb-memory-server` to run tests in isolation. Tests should use `connectTestDb()` and `clearTestDb()` helpers found in `src/test/utils.ts`.
- Prefer creating fixtures programmatically in tests (users, levels, school years, classes, enrollments). Avoid relying on any local database state.
- For flows that require role-based behavior, use `signToken({ userId, role })` (imported from `src/auth`) to generate short-lived tokens for test calls.
- For impersonation tests, use `POST /impersonation/start` and remember to call `POST /impersonation/stop` or restore tokens in client code; tests typically operate directly with bearer tokens returned by `/impersonation/start`.
- Keep tests idempotent: cleanup is handled by `clearTestDb()` before each test.
- Running a single test file: `npx jest src/__tests__/integration/bulk_level.test.ts` or `npm test -- src/__tests__/integration/bulk_level.test.ts`.
- Run tests with coverage: `npx jest --coverage`.
- For E2E tests that involve UI and TLS, run the dev servers locally and set `RUN_E2E=1` when running the Playwright suite. See the `e2e/monitoring.spec.ts` for an example.
- How to write tests for role-based flows:
  - Create users programmatically and use `signToken({ userId, role })` to get a bearer token.
  - Use `connectTestDb()` and `clearTestDb()` to isolate tests.
- When adding new tests, group related assertions and keep tests focused (one behavior per test).
- If a test needs to create files (uploads) ensure you delete them or mock file storage; prefer in-memory tests where possible.

E2E tests (Playwright):

These tests are skipped by default (they require local dev servers to be running).

To run E2E locally:

1. Start the server (from project root):
   - `cd nvcar/server && npm run dev` (server runs on http://localhost:4000)
2. Start the client dev server (from project root):
   - `cd nvcar/client && npm run dev` (client uses https://localhost:5173)
3. In a separate terminal run:
   - `cd nvcar/server && RUN_E2E=1 npm run test:e2e`

CI:
- A GitHub Actions workflow `server-tests.yml` runs `npm test` in `nvcar/server` on push/PR.

Notes:
- Tests use `mongodb-memory-server` for an in-memory MongoDB instance (no external DB required).
- Some E2E tests require running the dev servers locally and trusting the local TLS cert for the client.
