"""Every claim the guided demo (frontend/src/tour.ts) makes on screen, checked against the model."""
import os

os.environ["HEATROUTE_DB"] = ":memory:"

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app

api = TestClient(app)


@pytest.fixture(autouse=True)
def clean():
    api.post("/api/reset")
    yield
    api.post("/api/reset")


def clients(t, scenario="edmonton_2024"):
    return {c["name"]: c for c in api.get("/api/ranked", params={"scenario": scenario, "t": t}).json()["clients"]}


def test_step1_everyone_ok():
    assert all(c["band"] == "green" for c in clients("2024-07-15T09:00").values())


def test_step2_margaret_ok_now_urgent_by_evening():
    m = clients("2024-07-16T12:00")["Margaret T."]
    assert m["band"] == "green" and m["forecast_band"] == "red"


def test_step3_margaret_first_gordon_ok():
    c = clients("2024-07-17T18:00")
    m = c["Margaret T."]
    assert m["rank"] == 1 and m["indoor_c"] == 34.8 and m["reasons"][0].startswith("34.8°C, 5 h straight above 31°C")
    assert c["Gordon B."]["band"] == "green"


def test_step4_phone_list_reaches_one_of_eight():
    c = clients("2024-07-17T18:00")
    urgent = [x for x in c.values() if x["band"] == "red" and x["status"] == "needs_visit"]
    assert len(urgent) == 8
    assert sum(x["phone_list_rank"] <= 8 for x in urgent) == 1
    assert c["Margaret T."]["phone_list_rank"] == 24


def test_step5_walter_smoke_copd_forecast_urgent():
    r = api.get("/api/ranked", params={"t": "2024-07-21T12:00"}).json()
    w = {c["name"]: c for c in r["clients"]}["Walter K."]
    assert r["smoke"] and w["age"] == 77
    assert w["band"] == "amber" and w["forecast_band"] == "red"
    assert "smoke + COPD" in w["reasons"]


def test_step6_and_7_routes_then_cooling_centre():
    t = "2024-07-21T12:00"
    routes = api.post("/api/routes", json={"t": t, "workers": 3, "top_n": 12}).json()
    assert "c01" in {w["stops"][0]["client_id"] for w in routes}
    api.post("/api/visits", json={"client_id": "c01", "t": t, "outcome": "moved_to_cooling"})
    assert clients(t)["Margaret T."]["status"] == "relocated"
    after = api.post("/api/routes", json={"t": t, "workers": 3, "top_n": 12}).json()
    assert "c01" not in {s["client_id"] for w in after for s in w["stops"]}


def test_step8_vancouver_has_urgent_clients():
    c = clients("2021-06-28T18:00", "vancouver_2021")
    assert any(x["band"] == "red" for x in c.values())
