# Verification of the collaborative showcase

Local verification on 2026-09-22 (Asia/Shanghai).

- DeepSeek, Jev, Photon and Valhalla live probes all returned HTTP 200.
- Configured LLM model: `deepseek-v4-flash`; returned model: `deepseek-flash`.
- Returned Jev model: `jev-1.13.0`.
- Final saved live run: `live-run.json`, 39,546 ms including discovery, 30 candidates, 18 review calls and 4 repair attempts. Local review latency: min 330 ms, median 358 ms, max 411 ms. One small run, not a benchmark.
- At v2 Jev flagged a second museum. The LLM changed the second activity from Museum of Contemporary Art Tokyo to Tsukiji Outer Market. At v3 both local and global checks passed.
- At elapsed 21,698 ms the LLM began the next activity while the v1 local review was running; the review finished at 22,077 ms and the LLM proposal at 22,604 ms. This is real overlapping dispatch, not animation.
- Later steps exceeded the walking-day window. Repair budget stopped the run with an unresolved time-window issue (717 minutes versus 600 available) and a preference flag. The result is explicitly an unverified draft requiring attention, not a successful complete itinerary.
- `live-run-initial.json` is the earlier run before balanced candidate sampling and cancellation improvements, retained for comparison; it is not the final implementation's trace.
- Fixture mode deterministically replaces the second museum with a garden and passes rechecks. All fixture data/judgments are simulated, with no artificial delays.

Known data limits: sparse Photon descriptions, unknown opening hours, no origin/destination legs or destination timezone validation. The map is an explicitly labelled coordinate schematic, not actual route geometry. The live path has no guarantee of producing a feasible itinerary for arbitrary input.

## Beijing repair regression

After changing repair output to indexed update/remove operations, the live Beijing run completed its bounded control flow in 20,774 ms, with 30 candidates and two repair submissions. All repaired activities retained controller-owned IDs; no error events occurred. The run stopped at the per-stage repair limit with outstanding review issues, so this is a protocol regression pass, not a claim of a fully validated itinerary. See `live-beijing-run.json`. Automated checks: 21 tests passed; production build passed.
