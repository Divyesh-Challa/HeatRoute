from datetime import datetime, timedelta

from backend.app import config as C
from backend.app.risk import (
    Visit, assess, band_for, consecutive_above, exposure, longest_run_above, queue_key, score_from, vulnerability,
)
from sim.roster import Client
from sim.weather import WeatherHour

T0 = datetime(2024, 7, 18, 0)


def client(**kw) -> Client:
    base = dict(id="c1", name="Test", age=84, lat=0, lon=0, neighbourhood="n", lives_alone=True,
                conditions=["heart disease"], has_ac=False)
    return Client(**{**base, **kw})


def weather(n=24, smoke=False):
    return [WeatherHour(T0 + timedelta(hours=i), 30.0, smoke) for i in range(n)]


def hours(n=24):
    return [T0 + timedelta(hours=i) for i in range(n)]


def test_exposure_counts_degree_hours_with_double_weight_above_31():
    e, hot_night = exposure([25.0, 27.0, 33.0], [T0.replace(hour=12)] * 3)
    assert e == 0 + 1 + (7 + 2 * 2)
    assert not hot_night


def test_overnight_bonus_when_home_never_cools():
    temps = [27.0] * 24
    e, hot_night = exposure(temps, hours())
    assert hot_night and e == 24 + C.NIGHT_BONUS


def test_vulnerability_weights():
    v, _ = vulnerability(client(), smoke_recent=False)
    assert v == 2 + 2 + 2 + 1  # age 70+, alone, no AC, one condition
    v85, _ = vulnerability(client(age=90), smoke_recent=False)
    assert v85 == v + 1


def test_smoke_only_adds_for_sensitive_conditions():
    lung = client(conditions=["COPD"])
    assert vulnerability(lung, True)[0] - vulnerability(lung, False)[0] == C.VULNERABILITY["smoke_sensitive"]
    other = client(conditions=["diabetes"])
    assert vulnerability(other, True)[0] == vulnerability(other, False)[0]


def test_conditions_are_capped():
    v, _ = vulnerability(client(conditions=["a", "b", "c", "d", "e"]), False)
    assert v == 2 + 2 + 2 + 3


def test_score_grows_with_exposure_and_vulnerability():
    assert score_from(0, 10) == 0
    assert score_from(100, 2) < score_from(100, 8) < score_from(200, 8) <= 100


def test_bands():
    assert band_for(70, False) == "red"
    assert band_for(10, True) == "red"
    assert band_for(30, False) == "amber"
    assert band_for(5, False) == "green"


def test_runs_above_threshold():
    t = [32, 32, 32, 25, 31, 31]
    assert consecutive_above(t, 31) == 2
    assert longest_run_above(t, 31) == 3


def test_escalation_needs_living_alone():
    indoor = [32.0] * 24
    assert assess(client(), indoor, weather(), 23, []).escalated
    assert not assess(client(lives_alone=False), indoor, weather(), 23, []).escalated


def test_reasons_lead_with_temperature_and_stop_at_four():
    a = assess(client(conditions=["COPD", "heart disease"]), [32.0] * 24, weather(smoke=True), 23, [])
    assert len(a.reasons) <= 4
    assert a.reasons[0].startswith("32.0°C")
    assert "smoke + COPD" in a.reasons


def test_visit_ok_deprioritizes_for_four_hours():
    indoor = [30.0] * 30
    w = weather(30)
    v = [Visit("c1", T0 + timedelta(hours=20), "ok")]
    before = assess(client(), indoor, w, 19, v)
    during = assess(client(), indoor, w, 22, v)
    after = assess(client(), indoor, w, 25, v)
    assert before.status == "needs_visit"
    assert during.status == "visited_ok" and during.score < before.score
    assert after.status == "needs_visit"


def test_cooling_centre_stops_exposure():
    indoor = [33.0] * 30
    w = weather(30)
    v = [Visit("c1", T0 + timedelta(hours=10), "moved_to_cooling")]
    a = assess(client(), indoor, w, 29, v)
    assert a.status == "relocated"
    assert a.breakdown["exposure"] < assess(client(), indoor, w, 29, []).breakdown["exposure"]


def test_911_removes_from_queue():
    a = assess(client(), [33.0] * 24, weather(), 23, [Visit("c1", T0, "called_911")])
    assert a.status == "escalated" and a.band == "unknown"
    open_case = assess(client(id="c2"), [27.0] * 24, weather(), 23, [])
    assert queue_key(open_case) < queue_key(a)


def test_visits_after_slider_time_are_ignored():
    v = [Visit("c1", T0 + timedelta(hours=23), "called_911")]
    assert assess(client(), [33.0] * 24, weather(), 10, v).status == "needs_visit"
