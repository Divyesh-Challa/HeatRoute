"""The 5-minute demo, as a test. If this passes, the stage demo works."""
import os

os.environ["HEATROUTE_DB"] = ":memory:"

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app

api = TestClient(app)
S = "edmonton_2024"


@pytest.fixture(autouse=True)
def clean():
    api.post("/api/reset")
    yield


def ranked(t, scenario=S):
    r = api.get("/api/ranked", params={"scenario": scenario, "t": t})
    assert r.status_code == 200
    return r.json()


def by_name(data):
    return {c["name"]: c for c in data["clients"]}


def test_scenarios_and_timeline():
    sc = api.get("/api/scenarios").json()
    assert {s["id"] for s in sc} == {"edmonton_2024", "edmonton_2021", "vancouver_2021"}
    assert next(s for s in sc if s["id"] == S)["has_smoke"]
    tl = api.get("/api/timeline", params={"scenario": S}).json()
    assert tl["start"] == "2024-07-15T00:00" and len(tl["hours"]) == 12 * 24


def test_demo_starts_all_green():
    d = ranked("2024-07-15T09:00")
    assert d["counts"]["red"] == 0 and d["counts"]["amber"] == 0


def test_margaret_rises_to_first_and_gordon_stays_green():
    d = ranked("2024-07-17T18:00")
    m, g = by_name(d)["Margaret T."], by_name(d)["Gordon B."]
    assert m["rank"] == 1 and m["band"] == "red"
    assert any("lives alone" in r for r in m["reasons"]) and any("°C" in r for r in m["reasons"])
    assert g["band"] == "green" and g["age"] > m["age"]
    assert m["phone_list_rank"] > 10  # an oldest-first phone list buries her


def test_smoke_lifts_copd_clients():
    before, during = by_name(ranked("2024-07-19T12:00")), by_name(ranked("2024-07-22T12:00"))
    assert during["Lucille P."]["rank"] < before["Lucille P."]["rank"]
    assert "smoke + COPD" in during["Lucille P."]["reasons"]
    assert ranked("2024-07-22T12:00")["smoke"]


def test_routes_cover_top_clients_with_etas():
    r = api.post("/api/routes", json={"scenario": S, "t": "2024-07-17T18:00", "workers": 3, "top_n": 12}).json()
    assert len(r) == 3
    first_stops = {w["stops"][0]["client_id"] for w in r}
    assert "c01" in first_stops
    assert all(s["eta"] >= "2024-07-17T18:00" for w in r for s in w["stops"])


def test_visit_reranks_and_reset_restores():
    t = "2024-07-17T18:00"
    assert api.post("/api/visits", json={"scenario": S, "client_id": "c01", "t": t, "outcome": "moved_to_cooling"}).json() == {"ok": True}
    m = by_name(ranked(t))["Margaret T."]
    assert m["status"] == "relocated" and m["rank"] > 20
    assert ranked(t)["clients"][0]["name"] != "Margaret T."
    assert api.get("/api/visits", params={"scenario": S}).json()[0]["outcome"] == "moved_to_cooling"
    api.post("/api/reset", params={"scenario": S})
    assert by_name(ranked(t))["Margaret T."]["rank"] == 1


def test_client_detail_has_history_and_forecast():
    d = api.get("/api/clients/c01", params={"scenario": S, "t": "2024-07-17T18:00"}).json()
    assert d["profile"]["name"] == "Margaret T."
    assert sum(p["future"] for p in d["temps"]) == 6
    assert len(d["temps"]) == 24 + 6


def test_other_cities_work():
    for sc, t in [("vancouver_2021", "2021-06-28T18:00"), ("edmonton_2021", "2021-06-30T18:00")]:
        d = ranked(t, sc)
        assert d["counts"]["red"] > 0 and d["heat_warning"]


def test_bad_input():
    assert api.get("/api/ranked", params={"scenario": "nope"}).status_code == 404
    assert api.get("/api/ranked", params={"t": "garbage"}).status_code == 422
    assert api.post("/api/visits", json={"client_id": "zz", "t": "2024-07-17T18:00", "outcome": "ok"}).status_code == 404
