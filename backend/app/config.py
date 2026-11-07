"""Every threshold and weight the risk engine and router use, in one place."""

# Indoor thresholds (°C). 26°C: BC Centre for Disease Control's indoor "overheating"
# guidance; 31°C: BCCDC's level above which susceptible people are at high risk.
T_WARM = 26.0
T_DANGER = 31.0
EXPOSURE_WINDOW_H = 24
NIGHT_HOURS = range(0, 7)  # 00:00–06:00
NIGHT_BONUS = 10.0  # degree-hours added if the home never dropped below T_WARM overnight
EXPOSURE_SCALE = 120.0  # degree-hours; E_norm = 1 − exp(−E / scale), 63% at one scale

VULNERABILITY = {
    "age_70": 2,
    "age_85": 3,  # replaces age_70
    "lives_alone": 2,
    "per_condition": 1,
    "max_conditions": 3,
    "mobility_limited": 1,
    "cognitive_impairment": 1,
    "no_ac": 2,
    "smoke_sensitive": 2,  # lung or heart condition while smoke is present
}
SMOKE_SENSITIVE = {"COPD", "asthma", "heart disease"}
SMOKE_LOOKBACK_H = 24

# score = 100 × E_norm × (1 + V/5) / SCORE_DIVISOR, clipped to 100 (V≈12 is the realistic max)
SCORE_DIVISOR = 3.4
BAND_RED = 60.0
BAND_AMBER = 25.0
ESCALATE_CONSECUTIVE_H = 3
FORECAST_H = 6

# Visit outcomes
OK_DEPRIORITIZE_H = 4
OK_SCORE_FACTOR = 0.25
COOLING_RESUME_HOUR = 8  # relocated clients accrue no exposure until 08:00 next day
COOLING_CENTRE_C = 22.0

HEAT_WARNING_OUTDOOR_C = 29.0  # ECCC Alberta heat warning daytime-high criterion

# Routing
DEFAULT_TOP_N = 12
DEFAULT_WORKERS = 3
ROAD_FACTOR = 1.3  # straight-line → road distance
SPEED_KMH = 30.0
VISIT_MINUTES = 20
