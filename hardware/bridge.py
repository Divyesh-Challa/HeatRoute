"""Forward sensor readings from a USB serial port to the HeatRoute backend.

Works with either board:
  * Arduino Nano heart-rate sensor: lines like "HR,72"
  * ESP32 Feather check-in button: JSON lines like {"device_id":"esp32-1","event":"help"}

Usage:
  python hardware/bridge.py                         # auto-detect the port, post to localhost:8000
  python hardware/bridge.py --port /dev/cu.usbserial-110 --api https://heatroute.onrender.com
  python hardware/bridge.py --simulate              # no hardware: heart rate ramps 72 -> 118 bpm
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sys
import time
import urllib.error
import urllib.request


def post(api: str, body: dict, key: str) -> bool:
    req = urllib.request.Request(
        f"{api.rstrip('/')}/api/live",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", **({"X-Device-Key": key} if key else {})},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=3) as r:
            return r.status == 200
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"  ! post failed: {e}", file=sys.stderr)
        return False


def parse(line: str, device_id: str) -> dict | None:
    """One serial line -> one /api/live body, or None to skip it."""
    line = line.strip()
    if line.startswith("HR,"):
        try:
            bpm = int(float(line[3:]))
        except ValueError:
            return None
        return {"device_id": device_id, "hr_bpm": bpm} if 30 <= bpm <= 230 else {"device_id": device_id, "event": "ping"}
    if line.startswith("{"):
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            return None
        if "device_id" not in msg:
            return None  # status lines such as {"wifi": "connected"}
        return {k: msg[k] for k in ("device_id", "hr_bpm", "event") if k in msg}
    return None  # RAW plotter lines and anything else


def find_port() -> str:
    ports = sorted(glob.glob("/dev/cu.usbserial*") + glob.glob("/dev/cu.usbmodem*") + glob.glob("/dev/cu.SLAB*")
                   + glob.glob("/dev/ttyUSB*") + glob.glob("/dev/ttyACM*"))
    if not ports:
        sys.exit("No USB serial port found. Plug the board in, or pass --port (on Windows e.g. COM3).")
    if len(ports) > 1:
        print(f"Several ports found, using {ports[0]}: {ports}")
    return ports[0]


def run_serial(args) -> None:
    try:
        import serial  # pyserial
    except ImportError:
        sys.exit("pip install -r hardware/requirements.txt")
    port = args.port or find_port()
    print(f"Reading {port} at {args.baud} baud -> {args.api}/api/live  (Ctrl-C to stop)")
    with serial.Serial(port, args.baud, timeout=2) as ser:
        while True:
            raw = ser.readline().decode(errors="ignore")
            body = parse(raw, args.device_id)
            if body:
                ok = post(args.api, body, args.key)
                print(("  sent " if ok else "  FAILED ") + json.dumps(body))


def run_simulate(args) -> None:
    print(f"Simulating {args.device_id}: 72 -> 118 bpm over 30 s, then holding. Ctrl-C to stop.")
    start = time.time()
    while True:
        elapsed = time.time() - start
        bpm = round(72 + min(elapsed / 30, 1) * 46)
        ok = post(args.api, {"device_id": args.device_id, "hr_bpm": bpm}, args.key)
        print(f"  {'sent' if ok else 'FAILED'} {bpm} bpm")
        time.sleep(1)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--port", help="serial port; auto-detected if omitted")
    p.add_argument("--baud", type=int, default=115200)
    p.add_argument("--api", default=os.environ.get("HEATROUTE_API", "http://localhost:8000"))
    p.add_argument("--device-id", default="nano-1", help="used for HR lines (JSON lines carry their own)")
    p.add_argument("--key", default=os.environ.get("HEATROUTE_DEVICE_KEY", ""))
    p.add_argument("--simulate", action="store_true", help="no hardware: send a rising heart rate")
    args = p.parse_args()
    try:
        run_simulate(args) if args.simulate else run_serial(args)
    except KeyboardInterrupt:
        print("\nstopped")


if __name__ == "__main__":
    main()
