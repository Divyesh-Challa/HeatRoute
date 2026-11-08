# HeatRoute live sensors (optional)

Two table-top devices stand in for what a client would wear or keep at home. They feed the same ranking as the simulated homes. **HeatRoute works fully without them**: the client drawer has a simulator, and `bridge.py --simulate` sends a rising heart rate from the command line.

| Device | Board | What it sends |
| --- | --- | --- |
| Heart-rate sensor | EXG Pill (ECG) + Arduino Nano | `HR,<bpm>` once a second |
| Check-in button | Adafruit ESP32 Feather V2 | "I'm OK", "I need help", the Nano's heart rate, keep-alives; blinks when the coordinator asks for a check-in |

Both devices are bound to **Margaret (c01)** (`LIVE_CLIENT` in `backend/app/config.py`). The replay slider shows history, but the devices are live: their readings count at whatever hour the slider shows.

## What the backend does with it

| Signal | Rule (`backend/app/risk.py: apply_live`) |
| --- | --- |
| Heart rate ≥ 100 bpm **and** indoor ≥ 26°C | escalate to the top, reason `heart rate 118 bpm` |
| Heart rate ≥ 100 bpm in a cool home | reason only, no escalation |
| "I need help" | escalate to the top, reason `pressed Help`, until a visit is logged |
| Check-in requested, no press within 45 s, during a heat warning | escalate, reason `missed check-in` |
| "I'm OK" | moves to *Handled* for 10 minutes, so no worker is sent, **unless** a danger rule above applies |

A heart rate older than 15 s is ignored. Thresholds live in `backend/app/config.py`.

## Wiring

```
EXG Pill            Arduino Nano                    ESP32 Feather V2
VCC  ─────────────  5V
GND  ─────────────  GND ──────────────────────────  GND
OUT  ─────────────  A0
                    D1 (TX) ── 1 kΩ ──┬───────────  RX (GPIO7)
                                      2 kΩ
                                      │
                                     GND
                                                    GPIO27 (T7) ── touch pad "I'm OK"
                                                    GPIO14 (T6) ── touch pad "I need help"
                                                    onboard button (GPIO38) = backup Help
                                                    red LED (GPIO13), NeoPixel (GPIO0)
```

- The 1 kΩ / 2 kΩ divider brings the Nano's 5 V TX down to about 3.3 V for the ESP32. Don't skip it.
- Touch pads: any bare wire, foil square or coin soldered or taped to the pin works. Keep the wires short and apart.
- Check the pin numbers against Adafruit's Feather V2 pinout before wiring; they are `#define`s at the top of `esp32_checkin.ino`.

**Electrodes (Lead I):** IN+ on the left forearm, IN− on the right forearm, REF on a bony spot (right elbow or wrist). Clean skin and fresh gel electrodes help the most.

**Safety:** run the laptop **on battery (charger unplugged)** whenever someone is wearing electrodes. This is a demo, not a medical device.

## Flashing

Arduino IDE 2 (or `arduino-cli`):

1. **Nano:** open `nano_heartrate/nano_heartrate.ino`, board *Arduino Nano* (try *ATmega328P (Old Bootloader)* if the upload fails), upload. Open the Serial Monitor at 115200: after about 2 s you should see `HR,<bpm>` once a second. For a waveform, set `PRINT_RAW 1` and use the Serial Plotter.
2. **ESP32:** install the *esp32* board package (Espressif) and the *Adafruit NeoPixel* library. Copy `esp32_checkin/secrets.example.h` to `secrets.h` and fill in the Wi-Fi name, password and `API_BASE`. Board *Adafruit Feather ESP32 V2*, upload. Don't touch the pads for the first second (calibration).

NeoPixel: yellow = joining Wi-Fi, green = talking to the backend, red = backend unreachable, blue flash = press sent.

## Running the demo

Recommended: **laptop + phone hotspot**, so the venue Wi-Fi doesn't matter.

1. Turn on the phone hotspot; join it with the laptop.
2. Start the backend so other devices can reach it: `.venv/bin/uvicorn backend.app.main:app --host 0.0.0.0 --port 8000` (after `make build`, this serves the whole app at `http://<laptop-ip>:8000`).
3. Put `http://<laptop-ip>:8000` in `secrets.h` as `API_BASE`, flash, power the ESP32 from a USB battery or the laptop.
4. A green **Live sensor · Margaret T.** chip appears under the headline. Click it to open her drawer.

**USB fallback** (no Wi-Fi, or the Nano on its own):

```bash
pip install -r hardware/requirements.txt
python hardware/bridge.py                 # auto-detects the port; posts to localhost:8000
python hardware/bridge.py --port /dev/cu.usbserial-110 --api http://localhost:8000
```

The bridge reads either board: the Nano's `HR,` lines or the ESP32's JSON lines.

**No hardware at all:** `python hardware/bridge.py --simulate` (72 → 118 bpm), or the simulator in Margaret's drawer.

**Posting to the deployed site:** set `API_BASE` to the Render URL. If you set `HEATROUTE_DEVICE_KEY` on Render, put the same value in `DEVICE_KEY`. Setting a key hides the on-screen simulator on that site.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Nano prints `HR,0` | No beat for 3 s: check electrode contact and placement; sit still; unplug the laptop charger. |
| Heart rate jumps around | Movement or poor contact. The value is a median of 8 beats, so give it 5–10 s. |
| ESP32 NeoPixel stays yellow | Wrong Wi-Fi details, or a 5 GHz-only network (the ESP32 needs 2.4 GHz). |
| NeoPixel red | `API_BASE` wrong, backend not started with `--host 0.0.0.0`, or the laptop firewall is blocking port 8000. |
| Touch fires by itself | Re-power with nothing touching the pads (recalibrates), or lower `TOUCH_RATIO`. |
| Chip says "Sensor offline" | Nothing heard for 20 s: check power and the NeoPixel colour. |
