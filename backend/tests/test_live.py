"""Live sensor rules: heart rate, check-in buttons, missed check-ins. The wall clock is controlled."""
import os

os.environ["HEATROUTE_DB"] = ":memory:"

import pytest
from fastapi.testclient import TestClient

from backend.app import config as C
from backend.app import store
from backend.app.main import app
from backend.app.risk import Assessment, LiveState, apply_live

api = TestClient(app)
HOT = "2024-07-17T18:00"  # Margaret 34.8°C, rank 1, heat warning
WARM_GREEN = "2024-07-16T12:00"  # Margaret 27.6°C, still green
COOL = "2024-07-15T09:00"  # everyone below 26°C, no heat warning
AMBER = "2024-07-16T15:00"  # Margaret on watch, not escalated


class Clock:
    t = 1_000_000.0


@pytest.fixture(autouse=True)
def clock(monkeypatch):
    Clock.t = 1_000_000.0
    monkeypatch.setattr(store, "now", lambda: Clock.t)
    api.post("/api/reset")
    yield Clock
    api.post("/api/reset")


def margaret(t):
    data = api.get("/api/ranked", params={"t": t}).json()
    return next(c for c in data["clients"] if c["client_id"] == C.LIVE_CLIENT), data


def send(**body):
    r = api.post("/api/live", json={"device_id": "esp32-1", **body})
    assert r.status_code == 200, r.text
    return r


# ---- pure rule ----

def base(**kw) -> Assessment:
    d = dict(score=30.0, band="amber", indoor_c=28.0, hours_above_26=10, hours_above_31=0, escalated=False,
             reasons=["28.0°C now · 10 h above 26°C", "age 84", "lives alone", "no AC"], status="needs_visit",
             last_visit=None, breakdown={})
    return Assessment(**{**d, **kw})


def test_rule_hr_and_heat_escalates_with_reason_second():
    a = apply_live(base(), LiveState(hr_bpm=118, hr_age_s=2, online=True), heat_warning=False)
    assert a.escalated and a.band == "red"
    assert a.reasons[:2] == ["28.0°C now · 10 h above 26°C", "heart rate 118 bpm"]


def test_rule_hr_without_heat_only_explains():
    a = apply_live(base(indoor_c=23.0, reasons=["age 84"], score=0, band="green"), LiveState(hr_bpm=118, hr_age_s=2), False)
    assert not a.escalated and a.band == "green" and "heart rate 118 bpm" in a.reasons


def test_rule_stale_hr_is_ignored():
    a = apply_live(base(), LiveState(hr_bpm=118, hr_age_s=C.HR_FRESH_S + 1), False)
    assert not a.escalated and not any("heart rate" in r for r in a.reasons)


def test_rule_ok_deprioritizes_unless_heart_rate_is_high():
    ok = apply_live(base(), LiveState(checkin="ok", checkin_age_s=5), False)
    assert ok.status == "checked_in" and ok.score < 30
    unsafe = apply_live(base(), LiveState(checkin="ok", checkin_age_s=5, hr_bpm=120, hr_age_s=1), False)
    assert unsafe.status == "needs_visit" and unsafe.escalated


def test_rule_missed_checkin_only_counts_in_a_heat_warning():
    assert apply_live(base(), LiveState(prompt_missed=True), heat_warning=True).escalated
    assert not apply_live(base(), LiveState(prompt_missed=True), heat_warning=False).escalated


def test_rule_ignores_clients_already_handled():
    a = apply_live(base(status="relocated"), LiveState(checkin="help"), True)
    assert a.status == "relocated" and not a.escalated


# ---- through the API ----

def test_no_device_changes_nothing():
    m, _ = margaret(WARM_GREEN)
    assert m["band"] == "green" and m["live"]["online"] is False


def test_heart_rate_turns_a_warm_green_client_red():
    send(hr_bpm=118)
    m, data = margaret(WARM_GREEN)
    assert m["band"] == "red" and m["escalated"] and m["rank"] == 1
    assert "heart rate 118 bpm" in m["reasons"]
    assert data["clients"][0]["client_id"] == C.LIVE_CLIENT


def test_heart_rate_in_a_cool_home_does_not_escalate():
    send(hr_bpm=118)
    m, _ = margaret(COOL)
    assert m["band"] == "green" and "heart rate 118 bpm" in m["reasons"]


def test_heart_rate_expires(clock):
    send(hr_bpm=118)
    clock.t += C.HR_FRESH_S + 1
    m, _ = margaret(WARM_GREEN)
    assert m["band"] == "green"
    assert api.get("/api/live").json()["hr_bpm"] is None


def test_help_goes_to_top_and_a_visit_clears_it():
    send(event="help")
    m, data = margaret(COOL)
    assert m["rank"] == 1 and m["reasons"][0] == "pressed Help" and m["band"] == "red"
    api.post("/api/visits", json={"client_id": C.LIVE_CLIENT, "t": COOL, "outcome": "ok"})
    m, _ = margaret(COOL)
    assert "pressed Help" not in m["reasons"]


def test_ok_moves_client_to_handled(clock):
    send(event="ok")
    m, data = margaret(AMBER)
    assert m["status"] == "checked_in" and data["counts"]["handled"] == 1
    clock.t += C.CHECKIN_OK_S + 1
    m, _ = margaret(AMBER)
    assert m["status"] == "needs_visit"


def test_ok_does_not_take_an_escalated_client_out_of_the_queue():
    send(event="ok")
    m, _ = margaret(HOT)
    assert m["status"] == "needs_visit" and m["rank"] == 1 and "checked in: OK" in m["reasons"]


def test_missed_checkin_escalates_during_heat_warning(clock):
    assert api.post("/api/live/prompt", json={"client_id": C.LIVE_CLIENT}).status_code == 200
    assert api.get("/api/live/esp32-1/prompt").json()["pending"] is True
    clock.t += C.PROMPT_TIMEOUT_S + 1
    m, data = margaret(HOT)
    assert data["heat_warning"] and "missed check-in" in m["reasons"] and m["rank"] == 1
    m, data = margaret(COOL)
    assert not data["heat_warning"] and "missed check-in" not in m["reasons"]


def test_answering_a_prompt_cancels_it(clock):
    api.post("/api/live/prompt", json={"client_id": C.LIVE_CLIENT})
    send(event="ok")
    clock.t += C.PROMPT_TIMEOUT_S + 1
    live = api.get("/api/live").json()
    assert not live["prompt_missed"] and not live["prompt_pending"]


def test_live_status_and_reset(clock):
    send(hr_bpm=72, event="ping")
    live = api.get("/api/live").json()
    assert live["online"] and live["hr_bpm"] == 72 and live["client_name"] == "Margaret T."
    assert live["devices"][0]["device_id"] == "esp32-1" and len(live["hr_history"]) == 1
    rev = live["rev"]
    send(hr_bpm=75)
    assert api.get("/api/live").json()["rev"] != rev
    clock.t += C.DEVICE_ONLINE_S + 1
    assert api.get("/api/live").json()["online"] is False
    api.post("/api/reset")
    assert api.get("/api/live").json()["devices"] == []


def test_bad_readings_and_prompts_rejected():
    assert api.post("/api/live", json={"device_id": "x", "hr_bpm": 400}).status_code == 422
    assert api.post("/api/live", json={"device_id": "x", "event": "dance"}).status_code == 422
    assert api.post("/api/live/prompt", json={"client_id": "c02"}).status_code == 400


def test_device_key_enforced_when_set(monkeypatch):
    monkeypatch.setenv("HEATROUTE_DEVICE_KEY", "s3cret")
    assert api.post("/api/live", json={"device_id": "x", "hr_bpm": 80}).status_code == 401
    ok = api.post("/api/live", json={"device_id": "x", "hr_bpm": 80}, headers={"X-Device-Key": "s3cret"})
    assert ok.status_code == 200 and api.get("/api/live").json()["key_required"] is True
