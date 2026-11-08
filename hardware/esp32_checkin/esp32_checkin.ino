// HeatRoute check-in button: Adafruit ESP32 Feather V2.
//
// Two capacitive touch pads: "I'm OK" and "I need help". The onboard button is a
// backup Help. The red LED blinks while the coordinator has asked for a check-in.
// The NeoPixel shows connection state: yellow = joining Wi-Fi, green = reaching the
// backend, red = backend unreachable, blue flash = button press sent.
//
// It also reads "HR,<bpm>" lines from the Arduino Nano heart-rate sensor on Serial1
// and forwards the heart rate. Every event is mirrored on the USB serial port as a
// JSON line, so hardware/bridge.py can forward it if Wi-Fi fails.
//
// Libraries: Adafruit NeoPixel (Library Manager). Board: "Adafruit Feather ESP32 V2".
// Check the pins below against Adafruit's Feather V2 pinout before wiring.

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Adafruit_NeoPixel.h>

#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "Copy secrets.example.h to secrets.h and fill in your Wi-Fi and API_BASE."
#endif

// ---------- Pins (Feather V2) ----------
#define TOUCH_OK_PIN 27        // T7: pad or wire for "I'm OK"
#define TOUCH_HELP_PIN 14      // T6: pad or wire for "I need help"
#define BUTTON_HELP_PIN 38     // onboard user button (SW38), backup Help
#define LED_PIN 13             // red LED
#ifndef PIN_NEOPIXEL
#define PIN_NEOPIXEL 0
#endif
#ifndef NEOPIXEL_I2C_POWER
#define NEOPIXEL_I2C_POWER 2
#endif
#define NANO_RX_PIN 7          // "RX" pin; Nano D1 (TX) -> 1k -> here, 2k -> GND
#define NANO_TX_PIN 8          // unused, but Serial1 needs one

#define DEVICE_ID "esp32-1"
#define REPORT_MS 2000         // heart rate + keep-alive
#define POLL_MS 2000           // check-in request
#define HR_STALE_MS 4000       // don't forward a heart rate older than this
#define TOUCH_RATIO 0.6        // touched when the reading drops below 60% of its baseline
#define PRESS_LOCKOUT_MS 1500

Adafruit_NeoPixel pixel(1, PIN_NEOPIXEL, NEO_GRB + NEO_KHZ800);

uint16_t okBaseline = 0, helpBaseline = 0;
unsigned long lastPressMs = 0, lastReportMs = 0, lastPollMs = 0;
int heartRate = 0;
unsigned long heartRateMs = 0;
bool promptPending = false;
bool backendOk = false;
String nanoLine;

void setPixel(uint8_t r, uint8_t g, uint8_t b) {
  pixel.setPixelColor(0, pixel.Color(r, g, b));
  pixel.show();
}

void showState() {
  if (WiFi.status() != WL_CONNECTED) setPixel(40, 30, 0);
  else if (backendOk) setPixel(0, 30, 0);
  else setPixel(40, 0, 0);
}

uint16_t touchBaseline(uint8_t pin) {
  uint32_t sum = 0;
  for (int i = 0; i < 32; i++) {
    sum += touchRead(pin);
    delay(5);
  }
  return sum / 32;
}

// HTTP(S) request to the backend. Returns the status code, or a negative value on failure.
int request(const char* method, const String& path, const String& body, String* response) {
  if (WiFi.status() != WL_CONNECTED) return -1;
  String url = String(API_BASE) + path;
  HTTPClient http;
  WiFiClientSecure secure;
  WiFiClient plain;
  if (url.startsWith("https")) {
    secure.setInsecure();  // demo only: skips certificate checks
    http.begin(secure, url);
  } else {
    http.begin(plain, url);
  }
  http.setTimeout(3000);
  http.addHeader("Content-Type", "application/json");
  if (strlen(DEVICE_KEY)) http.addHeader("X-Device-Key", DEVICE_KEY);
  int code = String(method) == "POST" ? http.POST(body) : http.GET();
  if (response && code > 0) *response = http.getString();
  http.end();
  return code;
}

void send(int hr, const char* event) {
  String body = String("{\"device_id\":\"") + DEVICE_ID + "\"";
  if (hr > 0) body += ",\"hr_bpm\":" + String(hr);
  if (event) body += String(",\"event\":\"") + event + "\"";
  body += "}";
  Serial.println(body);  // the USB fallback: bridge.py forwards these lines
  int code = request("POST", "/api/live", body, nullptr);
  backendOk = code == 200;
  showState();
}

void onPress(const char* event) {
  if (millis() - lastPressMs < PRESS_LOCKOUT_MS) return;
  lastPressMs = millis();
  setPixel(0, 0, 60);
  digitalWrite(LED_PIN, LOW);
  promptPending = false;
  send(0, event);
}

void readNano() {
  while (Serial1.available()) {
    char c = Serial1.read();
    if (c == '\n') {
      nanoLine.trim();
      if (nanoLine.startsWith("HR,")) {
        heartRate = nanoLine.substring(3).toInt();
        heartRateMs = millis();
      }
      nanoLine = "";
    } else if (nanoLine.length() < 32) {
      nanoLine += c;
    }
  }
}

void pollPrompt() {
  String resp;
  int code = request("GET", String("/api/live/") + DEVICE_ID + "/prompt", "", &resp);
  if (code == 200) {
    promptPending = resp.indexOf("\"pending\":true") >= 0;
    backendOk = true;
  } else {
    backendOk = false;
  }
  showState();
}

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  showState();
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) delay(250);
  Serial.println(WiFi.status() == WL_CONNECTED ? "{\"wifi\":\"connected\",\"ip\":\"" + WiFi.localIP().toString() + "\"}"
                                               : String("{\"wifi\":\"failed\"}"));
}

void setup() {
  Serial.begin(115200);
  Serial1.begin(115200, SERIAL_8N1, NANO_RX_PIN, NANO_TX_PIN);
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUTTON_HELP_PIN, INPUT_PULLUP);
  pinMode(NEOPIXEL_I2C_POWER, OUTPUT);
  digitalWrite(NEOPIXEL_I2C_POWER, HIGH);
  pixel.begin();
  pixel.setBrightness(40);

  // Calibrate with nothing touching the pads.
  okBaseline = touchBaseline(TOUCH_OK_PIN);
  helpBaseline = touchBaseline(TOUCH_HELP_PIN);
  connectWifi();
  send(0, "ping");
}

void loop() {
  readNano();

  if (touchRead(TOUCH_OK_PIN) < okBaseline * TOUCH_RATIO) onPress("ok");
  if (touchRead(TOUCH_HELP_PIN) < helpBaseline * TOUCH_RATIO || digitalRead(BUTTON_HELP_PIN) == LOW) onPress("help");

  unsigned long now = millis();
  if (now - lastReportMs >= REPORT_MS) {
    lastReportMs = now;
    if (WiFi.status() != WL_CONNECTED) WiFi.reconnect();
    bool fresh = heartRate > 0 && now - heartRateMs < HR_STALE_MS;
    send(fresh ? heartRate : 0, "ping");
  }
  if (now - lastPollMs >= POLL_MS) {
    lastPollMs = now;
    pollPrompt();
  }

  // Blink the red LED while a check-in is requested.
  digitalWrite(LED_PIN, promptPending && (now / 300) % 2 ? HIGH : LOW);
  delay(10);
}
