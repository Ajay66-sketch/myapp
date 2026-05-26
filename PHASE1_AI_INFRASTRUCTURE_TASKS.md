# Phase 1 — AI Infrastructure Optimization

## Goal
Implement Redis-backed deterministic AI prompt caching and safe token trimming with telemetry.

## Phase 1 Tasks

1. Add Redis-backed AI cache module
   - `src/services/aiCache.js`
   - Uses SHA-256 hash of `systemPrompt + prompt + model + provider`
   - TTL per cache entry
   - Telemetry hooks for cache hit/miss
   - Avoid vector/embedding caching

2. Add token trimming utility
   - `src/utils/aiTokenUtils.js`
   - Preserve system prompt fully
   - Preserve latest user message fully
   - Trim oldest context first
   - Do not drop moderation/system instructions silently
   - Use token estimation heuristics, not sync crypto on hot path

3. Integrate cache and trimming into AI provider
   - Update `src/services/aiProvider.js`
   - Keep backward-compatible provider output
   - Use `aiCache` lookup before remote provider call
   - Add cache telemetry and provider latency tracking
   - Compact cache serialization

4. Add lightweight AI metrics support for cache telemetry
   - `src/metrics/aiMetrics.js`
   - Register counters/gauges for cache hit ratios and provider latency
   - Hook into existing Prometheus metrics route if needed

5. Add Phase 1 test harness
   - `scripts/aiPhase1Tests.js`
   - Cover cache hit/miss, token trimming, and Redis outage fallback behavior

## Expected file mutations

- Create `src/services/aiCache.js`
- Create `src/utils/aiTokenUtils.js`
- Create `src/metrics/aiMetrics.js`
- Modify `src/services/aiProvider.js`
- Modify `src/routes/ai.js` if needed to include cache telemetry or new metrics hooks
- Add `scripts/aiPhase1Tests.js`
- Update `package.json` scripts only if necessary for test execution

## Validation plan

- Run `npm test` or `node scripts/verify-build.js` after Phase 1
- Execute `node scripts/aiPhase1Tests.js`
- Ensure no architecture assumptions fail before moving to Phase 2
