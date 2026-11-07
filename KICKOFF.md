# Kickoff prompt — paste this into Claude Code from the repo root

You are the orchestrator for HeatRoute. Read CLAUDE.md fully. Subagents are defined in .claude/agents/: sim-agent, backend-agent, frontend-agent, integration-reviewer.

Your job is to coordinate, not to write feature code yourself. Work in rounds:

**Round 0 (you, ~10 min):** Create the repo skeleton from CLAUDE.md, `.gitignore`, `.env.example`, a README stub, and `contract/api.md` plus `contract/fixtures/` with one realistic example JSON per endpoint (include Margaret ranked #1 in `ranked.json`). Commit.

**Round 1 (parallel):** Launch sim-agent, backend-agent, and frontend-agent at the same time.
- sim-agent: weather loader with synthetic fallback, thermal model, roster with Margaret and the contrast client, tests.
- backend-agent: risk engine with tests, `/timeline`, `/ranked`, `/clients/{id}/temps`, `/reset`. Until sim is ready, use a tiny stub dataset inside backend tests only.
- frontend-agent: time slider + ranked list + layout on mocks.

**Round 2:** Run integration-reviewer. Fix failures by sending each one back to the owning agent. Then launch in parallel:
- backend-agent: `/routes`, `/visits`, visit outcomes.
- frontend-agent: map with routes, client detail chart, visit buttons, switch to the real API.

**Round 3:** integration-reviewer again, then polish: warning banner, README technical decisions section with formulas and sources, `make dev` or one script that starts everything.

Rules for you:
- Never let two agents edit the same folder at once.
- Any contract change: update CLAUDE.md and `contract/` first, then tell every affected agent.
- After each round, give me a 5-line status: what works, what's broken, what's next.
- If anything blocks for more than ~20 minutes, apply the cut order in CLAUDE.md instead of pushing on.
- Stop and ask me before deleting files, rewriting git history, or changing the demo sequence.

Start with Round 0 now.
