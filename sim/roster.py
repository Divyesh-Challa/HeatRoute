"""Synthetic client roster. Every person here is invented."""
from __future__ import annotations

import random
from dataclasses import asdict, dataclass, field

from .scenarios import SCENARIOS

FIRST_NAMES = [
    "Dorothy", "Harold", "Evelyn", "Frank", "Ruth", "Walter", "Irene", "Ernest", "Gladys", "Albert",
    "Mildred", "Raymond", "Agnes", "Stanley", "Hazel", "Lloyd", "Doris", "Clarence", "Edna", "Leonard",
    "Mei", "Harjit", "Rosa", "Tomasz", "Amara", "Yusuf", "Lien", "Gurpreet", "Olga", "Hiroshi",
    "Bernice", "Wilfred", "Marguerite", "Joseph", "Nadia", "Armando", "Ingrid", "Kwame", "Theresa", "Viktor",
    "Shirley", "Douglas", "Pauline", "Kenneth", "Beatrice", "Roland", "Lorraine", "Emile", "Sunita", "Grace",
    "Maria", "Ivan", "Fatima", "Rajinder", "Colette", "Desmond", "Anneliese", "Bao", "Josephine", "Cyril",
]
LAST_INITIALS = "ABCDEFGHJKLMNPRSTVWY"
CONDITIONS = ["heart disease", "COPD", "diabetes", "kidney disease", "mental illness", "Parkinson's", "asthma"]
CONDITION_WEIGHTS = [5, 3, 4, 2, 2, 1, 2]


@dataclass
class Client:
    id: str
    name: str
    age: int
    lat: float
    lon: float
    neighbourhood: str
    lives_alone: bool
    conditions: list[str] = field(default_factory=list)
    mobility_limited: bool = False
    cognitive_impairment: bool = False
    has_ac: bool = False
    floor: int = 1
    top_floor: bool = False
    orientation: str = "E"  # N | E | S | W
    insulation: str = "average"  # poor | average | good

    def to_dict(self) -> dict:
        return asdict(self)


# Demo anchors. Their homes and needs are fixed so the story is the same every run.
ANCHORS = [
    dict(name="Margaret T.", age=84, hood=0, lives_alone=True, conditions=["heart disease"],
         mobility_limited=True, has_ac=False, floor=6, top_floor=True, orientation="S", insulation="average"),
    dict(name="Gordon B.", age=91, hood=0, lives_alone=True, conditions=["diabetes"],
         mobility_limited=True, has_ac=True, floor=0, top_floor=False, orientation="N", insulation="good"),
    dict(name="Walter K.", age=77, hood=3, lives_alone=False, conditions=["COPD"],
         has_ac=False, floor=2, top_floor=True, orientation="W", insulation="average"),
    dict(name="Lucille P.", age=73, hood=6, lives_alone=True, conditions=["COPD", "heart disease"],
         has_ac=False, floor=1, top_floor=False, orientation="E", insulation="average"),
]


def generate_roster(scenario_id: str, seed: int = 42, n: int = 60) -> list[Client]:
    """Same people in every scenario (same seed); only their map position follows the city."""
    hoods = SCENARIOS[scenario_id].neighbourhoods
    rng = random.Random(seed)
    clients: list[Client] = []
    for i in range(n):
        cid = f"c{i + 1:02d}"
        jlat, jlon = rng.uniform(-0.009, 0.009), rng.uniform(-0.014, 0.014)
        if i < len(ANCHORS):
            a = dict(ANCHORS[i])
            hood = hoods[a.pop("hood") % len(hoods)]
            clients.append(Client(id=cid, lat=round(hood[1] + jlat * 0.4, 5), lon=round(hood[2] + jlon * 0.4, 5),
                                  neighbourhood=hood[0], **a))
            continue
        hood = hoods[rng.randrange(len(hoods))]
        n_cond = rng.choices([0, 1, 2, 3], weights=[2, 4, 3, 1])[0]
        conds: list[str] = []
        while len(conds) < n_cond:
            c = rng.choices(CONDITIONS, weights=CONDITION_WEIGHTS)[0]
            if c not in conds:
                conds.append(c)
        apartment = rng.random() < 0.6
        floor = rng.randint(1, 12) if apartment else rng.choice([0, 1])
        clients.append(Client(
            id=cid,
            name=f"{FIRST_NAMES[(i * 7) % len(FIRST_NAMES)]} {rng.choice(LAST_INITIALS)}.",
            age=rng.choices([rng.randint(62, 69), rng.randint(70, 84), rng.randint(85, 98)], weights=[2, 5, 3])[0],
            lat=round(hood[1] + jlat, 5),
            lon=round(hood[2] + jlon, 5),
            neighbourhood=hood[0],
            lives_alone=rng.random() < 0.45,
            conditions=conds,
            mobility_limited=rng.random() < 0.35,
            cognitive_impairment=rng.random() < 0.15,
            has_ac=rng.random() < 0.6,
            floor=floor,
            top_floor=apartment and rng.random() < 0.3 or not apartment and floor == 1,
            orientation=rng.choice("NESW"),
            insulation=rng.choices(["poor", "average", "good"], weights=[3, 5, 2])[0],
        ))
    return clients
