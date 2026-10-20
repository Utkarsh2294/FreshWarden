# ESP32 sensor prototype

Uncompiled and hardware-unverified. Use Arduino ESP32 core, OneWire and DallasTemperature libraries. Copy config.example.h to config.h, enter Wi-Fi, HTTPS host, registered device identifier/key and host CA certificate. TLS verification must remain enabled. GPIO4→DS18B20 data with a 4.7kΩ pull-up to 3.3V; VDD→3.3V; GND→GND.

Samples every 30 seconds, validates readings, timestamps via NTP, buffers 200 readings in RAM, and retries batches of 20. Power loss loses buffered RAM. Humidity/door inputs, hardware watchdog, exponential reconnect backoff and clock calibration remain pending before hardware deployment. Obtain current prices for board, sensor, resistor, power and enclosure; none have been verified.
