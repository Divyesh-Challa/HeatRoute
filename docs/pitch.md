# HeatRoute pitch: 5 minutes

Open before you start: the app with **Guided demo** started (or `/?tour=1`), browser zoom 110%. Advance with → or a presentation clicker; if you get lost, `/?tour=N` jumps straight to step N. Turn on **High contrast** if the projector is washed out. Backup: a screen recording of the same run, and the local server (`make build && make api`) in case the venue Wi-Fi fails.

## 0:00 – 0:40 · The problem

> In the 2021 heat dome, 619 people died in BC. 98% died **inside their homes**. Two-thirds were over 70 and more than half lived alone. The same heat broke records here in Alberta. And in July 2024 Edmonton had a week of 35-degree days, then wildfire smoke, the week Jasper burned.
>
> During a heat wave, a home care coordinator has to decide who gets a visit first. Today they do it with a phone list, usually oldest first. That list knows who is old. It doesn't know whose home is hot.

## 0:40 – 1:00 · The idea

> HeatRoute combines two things nobody puts together: **how hot each client's home has been**, and **how vulnerable that person is**. It answers three questions on one screen: who is in danger, why, and where workers should go next.

## 1:00 – 3:30 · Demo

1. **Jul 15.** "Real Environment Canada weather for Edmonton, July 2024. Sixty synthetic clients. Everyone's green."
2. **Click Margaret.** "Margaret, 84. Sixth floor, south-facing, no AC, lives alone, heart disease."
3. **Drag to Jul 16, noon.** "She's still green. But look: *forecast urgent by 18:00*. HeatRoute runs the same model six hours ahead, so a worker can be there before her apartment gets dangerous."
4. **Drag to Jul 17, 18:00.** "Outside it's 30. Inside Margaret's apartment it's 34.8, and it's been over 31 for five hours. She's #1, and here's why, in plain words. An oldest-first phone list would reach her at **call 24**." Point at Gordon: "Gordon is 91, older, but ground floor, north-facing, with AC. He's fine, and HeatRoute knows it."
5. **The killer number.** Flip the queue to **Oldest first**. "This is today's phone list for the same hour. There are 8 urgent clients. The first 8 calls reach **one** of them. It takes 58 calls to reach them all."
6. **Drag to Jul 21, noon.** "Wildfire smoke, the week Jasper burned. People are told to close their windows, so homes without AC can't cool down at night. Walter, 77, has COPD. He doesn't live alone, so a phone list wouldn't worry, but he's flagged `smoke + COPD` and forecast urgent by six. By tomorrow the urgent list grows from 8 to 18."
7. **Plan routes, 3 workers.** "Every worker starts at one of the three most urgent clients, then takes nearby ones. ETAs included, and it prints for workers in the field."
8. **Margaret → Moved to cooling centre.** "Logged. The queue re-ranks and the routes update."
9. **Switch to Vancouver 2021.** "Same people, same code, another city."

## 3:30 – 4:20 · How it works (show the client drawer)

> Indoor temperature comes from a thermal model of each home: insulation, sun on south and west walls, top floors, the stack effect in apartment buildings, and smoke closing the windows. Risk is heat exposure in degree-hours above BCCDC's 26 and 31 degree thresholds, multiplied by vulnerability. Every weight is in one config file, every rule is unit-tested, and the entire demo you just saw runs as an automated test.

## 4:20 – 5:00 · Path forward

> Next: validate the model with $30 temperature loggers in consenting homes, switch to Environment Canada's live forecast, have nurses review the weights, and pilot with one Edmonton home care provider for a summer, side by side with their phone list, measuring how fast the highest-risk people get a visit. The data stays in Canada under Alberta's Health Information Act.
>
> Heat deaths happen one quiet apartment at a time. HeatRoute tells you which door to knock on first.

---

## Judge Q&A

**Why not just use the outdoor temperature?**
Everyone in a city shares the outdoor temperature; what differs is the home. A sixth-floor south-facing unit with no AC ran 10°C hotter than an AC ground-floor unit in the same hour. 98% of the 2021 deaths were indoors.

**How did you choose the weights? Are they clinically valid?**
They're evidence-informed, not clinically validated: thresholds from BCCDC, factors from the BC coroner's review (age, living alone, no AC, chronic disease). They all live in one config file, and a clinical review with home care nurses is pilot step 3. The design makes them easy to change and every change is testable.

**You don't measure real homes, so how do you know indoor temperatures?**
It's a model driven by real weather, calibrated to plausible ranges: AC homes hold 24.5°C, no-AC top floors reach 34–36°C. Validating against sensors is step one. With sensors, measured temperature simply replaces the model for that home.

**Does it only work for Edmonton?**
No. Weather and roster are inputs. We ship Edmonton 2024, Edmonton 2021 and Metro Vancouver 2021; any city with Environment Canada data works with one config entry.

**Why did you pick the Pitt Meadows station for Vancouver, not the airport?**
The airport sits on the ocean and peaked at 32°C. Inland stations hit 41°C. We placed the synthetic clients in the Tri-Cities and Maple Ridge to match the station.

**Is the smoke from the Jasper fire?**
Some of it. Edmonton's smoke observations start July 20, before the Jasper fire was ignited on July 22, so the smoke came from several fires. We say "the same week as Jasper" for that reason.

**Why straight-line routing?**
It's instant and works offline. With real addresses, the distance function swaps for a road router (OSRM) or OR-Tools with time windows. The priority logic stays the same: workers start with the most urgent clients. We also measured: our proximity split beats plain round-robin in 11 of 12 cases, by 10–30%.

**What about privacy?**
The demo uses synthetic people only. A deployment holds risk flags, not full records; it's hosted in Canada with role-based access and an audit log, and goes through a privacy impact assessment under Alberta's Health Information Act.

**Who would pay for it / how is it sustained?**
It's open source, and it runs on one small cloud instance per agency. Loggers are about $30 each. Home care providers already spend coordinator hours on phone triage during heat events; this replaces that time with a ranked list.

**What happens after "moved to cooling centre"?**
Their exposure stops accruing until 08:00 the next day, and they leave the queue. "Checked OK" lowers their priority for 4 hours, then they return if their home is still hot. "Called 911" removes them.

**What if the score is wrong?**
Every rank shows its reasons, so a coordinator can see and override it. Escalation also has a hard rule that doesn't depend on weights: alone, at ≥31°C for 3 hours.
