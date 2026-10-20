#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <time.h>
#include "config.h"
OneWire bus(4);
DallasTemperature thermometer(&bus);
struct Sample { float temp; time_t ts; };
Sample pending[200];
int head = 0, count = 0;
unsigned long lastRead = 0, lastReconnect = 0;
void setup() {
  Serial.begin(115200); thermometer.begin();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  configTime(0, 0, "pool.ntp.org", "time.google.com");
}
void loop() {
  if (WiFi.status() != WL_CONNECTED && millis() - lastReconnect > 10000) {
    WiFi.reconnect(); lastReconnect = millis();
  }
  if (millis() - lastRead >= 30000) {
    lastRead = millis(); thermometer.requestTemperatures();
    float t = thermometer.getTempCByIndex(0); time_t now = time(nullptr);
    if (t >= -40 && t <= 80 && now > 1700000000 && count < 200) {
      pending[(head + count) % 200] = {t, now}; count++;
    } else Serial.println("Sample rejected: invalid sensor, clock, or full buffer");
  }
  if (WiFi.status() == WL_CONNECTED && count > 0) {
    WiFiClientSecure client; client.setCACert(ROOT_CA);
    HTTPClient http; http.setTimeout(15000);
    if (http.begin(client, API_URL)) {
      http.addHeader("Content-Type", "application/json");
      http.addHeader("x-device-key", DEVICE_KEY);
      int n = min(count, 20); String payload = "[";
      for (int i = 0; i < n; i++) {
        Sample s = pending[(head + i) % 200];
        char iso[25]; struct tm utc; gmtime_r(&s.ts, &utc);
        strftime(iso, sizeof(iso), "%Y-%m-%dT%H:%M:%SZ", &utc);
        if (i) payload += ",";
        payload += String("{\"deviceId\":\"") + DEVICE_ID + "\",\"zoneId\":\"" + ZONE_ID + "\",\"tempC\":" + String(s.temp, 2) + ",\"ts\":\"" + iso + "\"}";
      }
      payload += "]"; int code = http.POST(payload); http.end();
      if (code >= 200 && code < 300) { head = (head + n) % 200; count -= n; }
      else delay(5000);
    }
  }
  delay(100);
}
