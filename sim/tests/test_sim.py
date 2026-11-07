from datetime import datetime, timedelta

from sim.roster import Client, generate_roster
from sim.scenarios import SCENARIOS
from sim.thermal import AC_SETPOINT, simulate_indoor
from sim.weather import WeatherHour, load_weather, persist_smoke, synthetic_weather


def flat_heat(hours: int = 72, hot: float = 34.0, night: float = 20.0, smoke: bool = False) -> list[WeatherHour]:
    start = datetime(2024, 7, 15)
    out = []
    for i in range(hours):
        t = start + timedelta(hours=i)
        out.append(WeatherHour(t, hot if 10 <= t.hour <= 20 else night, smoke))
    return out


def home(**kw) -> Client:
    base = dict(id="x", name="X", age=80, lat=0, lon=0, neighbourhood="n", lives_alone=True)
    return Client(**{**base, **kw})


def test_every_scenario_loads_real_data():
    for sid in SCENARIOS:
        w = load_weather(sid)
        assert len(w) > 200
        assert all(b.t - a.t == timedelta(hours=1) for a, b in zip(w, w[1:]))
        assert max(h.outdoor_c for h in w) > 33


def test_edmonton_2024_has_observed_smoke():
    w = load_weather("edmonton_2024")
    smoky_days = {h.t.day for h in w if h.smoke}
    assert {20, 21, 22, 23, 24}.issubset(smoky_days)


def test_missing_file_falls_back_to_synthetic(tmp_path):
    w = load_weather("edmonton_2024", data_dir=tmp_path)
    assert w == synthetic_weather("edmonton_2024")
    assert 35 < max(h.outdoor_c for h in w) < 40


def test_smoke_persists_through_unreported_hours():
    hrs = flat_heat(30)
    hrs[2] = WeatherHour(hrs[2].t, hrs[2].outdoor_c, True)
    out = persist_smoke(hrs, persist=12)
    assert [h.smoke for h in out[:16]] == [False, False] + [True] * 13 + [False]


def test_ac_caps_indoor_temperature():
    temps = simulate_indoor([home(has_ac=True)], flat_heat())["x"]
    assert max(temps) <= AC_SETPOINT + 1e-9


def test_top_floor_south_is_hotter_than_ground_north():
    hot = home(id="hot", floor=6, top_floor=True, orientation="S")
    cool = home(id="cool", floor=0, orientation="N", insulation="good")
    t = simulate_indoor([hot, cool], flat_heat())
    assert max(t["hot"]) > max(t["cool"]) + 3


def test_smoke_closed_windows_keep_nights_hot():
    c = [home(floor=3)]
    clear = simulate_indoor(c, flat_heat(smoke=False))["x"]
    smoky = simulate_indoor(c, flat_heat(smoke=True))["x"]
    assert min(smoky[48:]) > min(clear[48:]) + 1.5


def test_roster_is_deterministic_and_has_demo_anchors():
    a, b = generate_roster("edmonton_2024"), generate_roster("edmonton_2024")
    assert [c.to_dict() for c in a] == [c.to_dict() for c in b]
    assert len(a) == 60
    m, g = a[0], a[1]
    assert (m.name, m.age, m.top_floor, m.orientation, m.has_ac, m.lives_alone) == ("Margaret T.", 84, True, "S", False, True)
    assert "heart disease" in m.conditions
    assert (g.name, g.age, g.floor, g.orientation, g.insulation, g.has_ac) == ("Gordon B.", 91, 0, "N", "good", True)
    no_ac = sum(not c.has_ac for c in a) / len(a)
    alone = sum(c.lives_alone for c in a) / len(a)
    assert 0.3 <= no_ac <= 0.55 and 0.35 <= alone <= 0.6


def test_same_people_in_every_city():
    ed, van = generate_roster("edmonton_2024"), generate_roster("vancouver_2021")
    assert [c.name for c in ed] == [c.name for c in van]
    assert ed[0].lat > 53 and van[0].lat < 50
