# HeatRoute: written summary

**natHacks 2026 · Standard Division · Healthcare & Accessibility**

## Problem

Heat waves kill people inside their own homes. In the 2021 Western Canada heat dome, 619 people died in BC: 98% indoors, 67% aged 70+, 56% living alone. Alberta saw record heat in the same event, and in July 2024 Edmonton had a week of 33–35°C days followed by wildfire smoke, the same week the Jasper fire started. Smoke makes indoor heat worse, because people are told to keep windows shut.

Home care agencies are asked to check on vulnerable clients during extreme heat, but coordinators triage by phone list, usually oldest first. That list knows who is old, not whose home is hot. Existing tools split the problem: check-in services know who is vulnerable but not how hot their home is; home sensor platforms know the temperature but not who lives there.

## Solution

HeatRoute is a one-screen dispatch tool for the coordinator. For any hour of a heat event it:

1. **ranks every client** by an urgency score that multiplies indoor heat exposure by personal vulnerability;
2. **explains each rank** in plain words (`34.8°C, 5 h straight above 31°C · no relief overnight · age 84 · lives alone`);
3. **plans routes** for the workers on shift, most urgent first, with ETAs on a map;
4. **re-ranks** as soon as a visit is logged (checked OK, moved to a cooling centre, 911).

It also models **wildfire smoke** (closed windows, extra risk for lung and heart disease), shows a **6-hour forecast** of who is about to turn urgent, and shows where each client would sit on today's **oldest-first phone list**.

## Approach and key decisions

- **Real weather, synthetic people.** Hourly temperature and observed smoke from Environment Canada for three real events (Edmonton 2024, Edmonton 2021, Metro Vancouver 2021). We chose stations deliberately: Edmonton Blatchford for the urban heat island; Pitt Meadows rather than the ocean-cooled Vancouver airport. All 60 clients are invented, and they are the same people in every city.
- **Indoor temperature from physics, not guesswork.** A first-order thermal model per home (insulation time constant, solar gain by orientation and top floor, apartment stack effect, AC cap). Smoke hours slow night cooling to reflect closed windows.
- **A transparent, testable score.** Exposure in degree-hours above BCCDC's 26°C and 31°C thresholds over 24 h, with a penalty for nights without relief; vulnerability points for age, living alone, no AC, conditions, mobility, cognition and smoke sensitivity. Exposure gates the score, so a frail person in a cool home is not flagged, and a hard rule escalates anyone alone at ≥31°C for 3 hours. All weights live in one config file.
- **Routing that respects priority.** Each worker starts at one of the most urgent clients; the rest go to the nearest worker; the planner keeps the shorter of that plan and plain round-robin. That saves 10–30% of driving in 11 of 12 test cases.
- **Accessible by design.** Bands are words and colours, every row carries its reason, the whole tool works by keyboard, larger-text and high-contrast modes are one click away, and the route sheet prints.
- **Built for a reliable demo.** Pure-function risk and routing modules with 46 tests, including ones that play the entire demo and check every figure the guided walkthrough quotes; a reset endpoint; bookmarkable URLs; one Docker image deployed on Render.

## Results

On real weather with simulated homes:

- At 18:00 on July 17, 2024, HeatRoute flags **8 urgent clients. An oldest-first phone list reaches only 1 of them in its first 8 calls and needs 58 calls to reach all 8.** The pattern holds in all three events (5–6 of 18–19 urgent clients reached in the first 18–19 calls).
- Margaret, 84, alone on a sixth floor with no AC, is **#1 in HeatRoute and #24 on the phone list**. Gordon, 91, in a cool ground-floor unit with AC, correctly stays green.
- During the July 2024 smoke, the model's average overnight low inside no-AC homes rose from about 28°C to 31.5°C, while outdoor night lows rose only 2–3°C. Clients with COPD are flagged `smoke + COPD`, and the number of urgent clients grew from 8 to 18 as smoke settled in.

These are model outputs, not measured outcomes. Our first next step is to validate the indoor model against real sensors.

## Next steps

Validate with low-cost indoor loggers in consenting homes; switch to Environment Canada's live forecast; clinical review of the weights with home care nurses and public health; a one-season pilot with an Edmonton home care provider alongside the existing phone list, measuring time-to-first-visit for high-risk clients; Canadian hosting and a privacy impact assessment under Alberta's Health Information Act.

## Process

We started from the decision a coordinator actually makes and wrote the API contract first, so the simulator, backend and frontend could be built in parallel against shared fixtures. We tested data choices against the real record: the Vancouver airport station undersold the 2021 event, so we moved to an inland station, and we found the smoke observations that turned Edmonton 2024 into a compound heat-and-smoke scenario. We tuned the thermal model until its output was physically plausible, and fixed scoring problems the data exposed: scores tying at 100 (solved with soft saturation), bands flickering between day and night (solved by escalating on any 3-hour run in the last 24 h), and an apartment unit ranked no hotter than a house (solved with the stack effect). We then measured routing strategies on real scenario hours before choosing one.
