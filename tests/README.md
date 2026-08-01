# Regression tests

`colophon_suite.mjs` runs against a deployed Colophon contract and asserts the
payment and lifecycle rules on chain. Every check is a real transaction, because
the behaviour being tested is how the runtime settles value and how it treats a
refusal, neither of which can be observed in a mock.

```bash
cd colophon-app
COLOPHON_ADDR=0x... node ../tests/colophon_suite.mjs
```

It needs two funded local keystores and takes roughly twenty minutes: every write
waits for FINALIZED, four of them run a consensus round, and two of them wait out
a settlement window.

Studionet is unreliable enough that this matters. In one afternoon it returned
dropped connections, an HTML error page in place of JSON, an hourly rate limit,
and "all 8 execution slots occupied". All of those are retried with a backoff. A
refusal by the contract is never retried: that is a result, not an error, and it
must reach the assertion.
