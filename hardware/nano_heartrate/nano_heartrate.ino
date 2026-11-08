// HeatRoute heart-rate sensor: EXG Pill (ECG) on an Arduino Nano.
//
// Reads the EXG Pill's analog output at 500 Hz, finds R-peaks with a small
// Pan-Tompkins-style pipeline, and prints one line per second:
//
//   HR,72        heart rate in beats per minute (median of the last 8 beats)
//   HR,0         no reliable heartbeat for 3 s (loose electrode, movement)
//
// The lines go out on the hardware serial port at 115200 baud, which reaches
// both the USB cable (for hardware/bridge.py or the Serial Monitor) and the
// TX pin D1 (wired to the ESP32 Feather's RX through a voltage divider).
//
// Wiring: EXG Pill VCC -> 5V, GND -> GND, OUT -> A0.
// Electrodes (Lead I): IN+ left forearm, IN- right forearm, REF on a bony spot
// (right elbow or wrist). Run the laptop on battery while electrodes are on.
// Not a medical device.

#define ECG_PIN A0
#define SAMPLE_RATE 500                 // Hz
#define SAMPLE_US (1000000UL / SAMPLE_RATE)
#define PRINT_RAW 0                     // 1: also print RAW,<filtered> every sample for the Serial Plotter
#define INTEGRATION_WINDOW 75           // samples = 150 ms
#define REFRACTORY_MS 250               // no two beats closer than this (max 240 bpm)
#define LEARN_MS 2000                   // threshold learning after start-up
#define NO_BEAT_MS 3000                 // report HR,0 after this long without a beat
#define RR_HISTORY 8
#define RR_MIN_MS 333                   // 180 bpm
#define RR_MAX_MS 1500                  // 40 bpm

// ---------- Second-order IIR (biquad) ----------
struct Biquad {
  float b0, b1, b2, a1, a2;
  float x1 = 0, x2 = 0, y1 = 0, y2 = 0;

  float step(float x) {
    float y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x;
    y2 = y1; y1 = y;
    return y;
  }
};

// RBJ audio-EQ cookbook coefficients, Q = 0.707 (Butterworth).
Biquad makeFilter(bool highpass, float cutoffHz) {
  const float w0 = 2.0f * PI * cutoffHz / SAMPLE_RATE;
  const float alpha = sin(w0) / (2.0f * 0.7071f);
  const float c = cos(w0);
  const float a0 = 1.0f + alpha;
  Biquad f;
  if (highpass) {
    f.b0 = (1.0f + c) / 2.0f / a0;
    f.b1 = -(1.0f + c) / a0;
  } else {
    f.b0 = (1.0f - c) / 2.0f / a0;
    f.b1 = (1.0f - c) / a0;
  }
  f.b2 = f.b0;
  f.a1 = -2.0f * c / a0;
  f.a2 = (1.0f - alpha) / a0;
  return f;
}

// 5-15 Hz keeps the QRS complex and drops baseline wander, mains hum and most muscle noise.
Biquad highPass = makeFilter(true, 5.0f);
Biquad lowPass = makeFilter(false, 15.0f);

// ---------- Detector state ----------
float window[INTEGRATION_WINDOW];
float windowSum = 0;
uint8_t windowPos = 0;
float prevFiltered[2] = {0, 0};

float integPrev2 = 0, integPrev1 = 0;   // to find local maxima of the integrated signal
float signalPeak = 0, noisePeak = 0, threshold = 0;
bool learning = true;
float learnMax = 0, learnSum = 0;
unsigned long learnCount = 0;

unsigned long lastBeatMs = 0;
unsigned int rr[RR_HISTORY];
uint8_t rrCount = 0, rrPos = 0;

unsigned long nextSampleUs = 0;
unsigned long nextPrintMs = 0;
unsigned long startMs = 0;

int medianBpm() {
  if (rrCount < 3) return 0;
  unsigned int sorted[RR_HISTORY];
  for (uint8_t i = 0; i < rrCount; i++) sorted[i] = rr[i];
  for (uint8_t i = 1; i < rrCount; i++) {          // insertion sort, n <= 8
    unsigned int v = sorted[i];
    int8_t j = i - 1;
    while (j >= 0 && sorted[j] > v) { sorted[j + 1] = sorted[j]; j--; }
    sorted[j + 1] = v;
  }
  unsigned int mid = sorted[rrCount / 2];
  return (int)(60000UL / mid);
}

void onBeat(unsigned long nowMs) {
  if (lastBeatMs) {
    unsigned long interval = nowMs - lastBeatMs;
    if (interval >= RR_MIN_MS && interval <= RR_MAX_MS) {
      rr[rrPos] = interval;
      rrPos = (rrPos + 1) % RR_HISTORY;
      if (rrCount < RR_HISTORY) rrCount++;
    }
  }
  lastBeatMs = nowMs;
}

void processSample(unsigned long nowMs) {
  float x = analogRead(ECG_PIN);
  float filtered = lowPass.step(highPass.step(x));

  // Five-point-ish derivative, squared: emphasises the steep QRS slopes.
  float slope = filtered - prevFiltered[1];
  prevFiltered[1] = prevFiltered[0];
  prevFiltered[0] = filtered;
  float energy = slope * slope;

  // Moving-window integration over 150 ms.
  windowSum += energy - window[windowPos];
  window[windowPos] = energy;
  windowPos = (windowPos + 1) % INTEGRATION_WINDOW;
  float integ = windowSum / INTEGRATION_WINDOW;

#if PRINT_RAW
  Serial.print(F("RAW,"));
  Serial.println(filtered);
#endif

  if (learning) {
    learnMax = max(learnMax, integ);
    learnSum += integ;
    learnCount++;
    if (nowMs - startMs >= LEARN_MS) {
      signalPeak = learnMax * 0.5f;
      noisePeak = (learnSum / learnCount) * 0.5f;
      threshold = noisePeak + 0.25f * (signalPeak - noisePeak);
      learning = false;
    }
  } else if (integPrev1 > integPrev2 && integPrev1 >= integ) {
    // integPrev1 is a local maximum: a beat if it clears the threshold, otherwise noise.
    float peak = integPrev1;
    if (peak > threshold && nowMs - lastBeatMs > REFRACTORY_MS) {
      onBeat(nowMs);
      signalPeak = 0.125f * peak + 0.875f * signalPeak;
    } else {
      noisePeak = 0.125f * peak + 0.875f * noisePeak;
    }
    threshold = noisePeak + 0.25f * (signalPeak - noisePeak);
  }
  integPrev2 = integPrev1;
  integPrev1 = integ;
}

void setup() {
  Serial.begin(115200);
  for (uint8_t i = 0; i < INTEGRATION_WINDOW; i++) window[i] = 0;
  startMs = millis();
  nextSampleUs = micros();
  nextPrintMs = millis() + 1000;
}

void loop() {
  // Fixed-rate sampling; catches up if a print briefly delayed the loop.
  unsigned long nowUs = micros();
  if ((long)(nowUs - nextSampleUs) >= 0) {
    nextSampleUs += SAMPLE_US;
    processSample(millis());
  }

  unsigned long nowMs = millis();
  if ((long)(nowMs - nextPrintMs) >= 0) {
    nextPrintMs += 1000;
    bool lost = learning || lastBeatMs == 0 || nowMs - lastBeatMs > NO_BEAT_MS;
    if (lost) rrCount = 0;  // start fresh once the signal comes back
    Serial.print(F("HR,"));
    Serial.println(lost ? 0 : medianBpm());
  }
}
