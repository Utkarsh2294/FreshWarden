#pragma once
// Copy to config.h (ignored by Git). Register device and use its one-time key.
#define WIFI_SSID "YOUR_WIFI"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define API_URL "https://YOUR_API_HOST/api/telemetry"
#define DEVICE_ID "esp-chiller-01"
#define ZONE_ID "chiller-1"
#define DEVICE_KEY "YOUR_REGISTERED_DEVICE_KEY"
static const char ROOT_CA[] PROGMEM = R"EOF(YOUR_CA_CERTIFICATE_PEM)EOF";
