// Copy this file to secrets.h (git-ignored) and fill it in.
#pragma once

#define WIFI_SSID "your-hotspot-name"
#define WIFI_PASSWORD "your-hotspot-password"

// Where the HeatRoute backend runs. Default demo setup: the laptop on the same hotspot,
// started with `make api` -> use the laptop's IP (System Settings > Wi-Fi > Details).
// For the deployed site use e.g. "https://heatroute.onrender.com".
#define API_BASE "http://192.168.1.50:8000"

// Must match HEATROUTE_DEVICE_KEY on the server; leave empty if the server has none set.
#define DEVICE_KEY ""
