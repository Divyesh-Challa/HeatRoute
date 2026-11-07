from datetime import datetime

from backend.app.routing import Stop, haversine_km, nearest_neighbour, plan_routes, split_round_robin


def test_haversine_known_distance():
    # Edmonton downtown → Calgary downtown ≈ 280 km straight line
    assert 270 < haversine_km((53.5444, -113.4909), (51.0447, -114.0719)) < 290


def test_round_robin_gives_each_worker_a_top_client():
    stops = [Stop(f"c{i}", 53.5, -113.5) for i in range(7)]
    groups = split_round_robin(stops, 3)
    assert [g[0].client_id for g in groups] == ["c0", "c1", "c2"]
    assert sum(len(g) for g in groups) == 7


def test_nearest_neighbour_starts_with_most_urgent_then_goes_close():
    urgent = Stop("urgent", 53.60, -113.50)
    near = Stop("near", 53.601, -113.50)
    far = Stop("far", 53.40, -113.50)
    order = nearest_neighbour((53.45, -113.5), [urgent, far, near])
    assert [s.client_id for s in order] == ["urgent", "near", "far"]


def test_plan_routes_etas_increase():
    stops = [Stop(f"c{i}", 53.5 + i * 0.01, -113.5) for i in range(6)]
    routes = plan_routes(stops, 2, (53.54, -113.49), datetime(2024, 7, 18, 9))
    assert len(routes) == 2
    for r in routes:
        etas = [s["eta"] for s in r["stops"]]
        assert etas == sorted(etas) and etas[0] >= "2024-07-18T09:00"
        assert r["path"][0] == [53.54, -113.49]
        assert len(r["path"]) == len(r["stops"]) + 1
