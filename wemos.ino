
#include <ESP8266WiFi.h>
#include <PubSubClient.h>

// ============================================
// WIFI CONFIGURATION
// ============================================

const char* WIFI_SSID     = "Lab GEO 2.4GHz";
const char* WIFI_PASSWORD = "#WelcomeGEOUNO";

// ============================================
// MQTT CONFIGURATION
// ============================================

const char* MQTT_HOST = "mqtt.vantara.my.id";
const uint16_t MQTT_PORT = 1883;

const char* MQTT_USERNAME = "";
const char* MQTT_PASSWORD = "";

const char* CLIENT_ID = "Wemos_DoorExit_01";

// ============================================
// MQTT TOPICS
// ============================================

const char* TOPIC_COMMAND =
  "smartlab-geo/door/exit/command";

const char* TOPIC_STATUS =
  "smartlab-geo/door/exit/status";

const char* TOPIC_AVAILABILITY =
  "smartlab-geo/door/exit/availability";

// ============================================
// HARDWARE CONFIGURATION
// ============================================

#define RELAY_PIN D5

// Modul relay biru standar 5V (Active LOW)
// Menggunakan mode Open-Drain agar GPIO 3.3V Wemos kuat mematikan modul relay 5V:
// - ON  : OUTPUT + LOW (menarik pin IN ke GND -> relay aktif)
// - OFF : INPUT / High-Z (memutus arus dari 5V -> relay benar-benar mati)
#define AUTO_OFF_ENABLED true

// Relay ON duration: 1000 ms (jika AUTO_OFF_ENABLED = true)
const unsigned long OPEN_DURATION = 1000;

// ============================================
// GLOBAL VARIABLES
// ============================================

WiFiClient espClient;
PubSubClient mqttClient(espClient);

bool relayActive = false;

unsigned long relayStartTime = 0;
unsigned long lastMQTTAttempt = 0;

const unsigned long MQTT_RECONNECT_INTERVAL = 5000;

// ============================================
// RELAY CONTROL
// ============================================

void setRelayHardware(bool active) {
  if (active) {
    pinMode(RELAY_PIN, OUTPUT);
    digitalWrite(RELAY_PIN, LOW);   // Active LOW -> Relay ON
  } else {
    pinMode(RELAY_PIN, INPUT);      // High-Z (Open-Drain) -> Relay OFF sempurna pada modul 5V
  }
}

void openDoor() {

  if (relayActive) {
    Serial.println("[RELAY] Already ON");
    return;
  }

  Serial.println("[RELAY] ON");

  setRelayHardware(true);

  relayActive = true;
  relayStartTime = millis();

  if (mqttClient.connected()) {
    mqttClient.publish(TOPIC_STATUS, "ON", true);
  }
}

void closeRelay() {

  setRelayHardware(false);

  relayActive = false;

  Serial.println("[RELAY] OFF");

  if (mqttClient.connected()) {
    mqttClient.publish(TOPIC_STATUS, "OFF", true);
  }
}

// ============================================
// MQTT CALLBACK
// ============================================

void mqttCallback(
  char* topic,
  byte* payload,
  unsigned int length
) {

  String message;

  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  message.trim();
  message.toUpperCase();

  Serial.println();
  Serial.println("[MQTT] MESSAGE RECEIVED");

  Serial.print("Topic   : ");
  Serial.println(topic);

  Serial.print("Payload : ");
  Serial.println(message);

  if (String(topic) == TOPIC_COMMAND) {

    if (message == "ON") {

      openDoor();

    }
    else if (message == "OFF") {

      closeRelay();

    }
    else {

      Serial.println("[MQTT] Invalid command. Use ON or OFF.");

    }
  }
}

// ============================================
// WIFI CONNECTION
// ============================================

void connectWiFi() {

  Serial.println();
  Serial.println("[WIFI] Connecting...");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void checkWiFi() {

  static unsigned long lastWiFiCheck = 0;

  if (millis() - lastWiFiCheck < 10000) {
    return;
  }

  lastWiFiCheck = millis();

  if (WiFi.status() != WL_CONNECTED) {

    Serial.println("[WIFI] Disconnected");
    Serial.println("[WIFI] Reconnecting...");

    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }
}

// ============================================
// MQTT CONNECTION
// ============================================

void connectMQTT() {

  if (mqttClient.connected()) {
    return;
  }

  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  Serial.println("[MQTT] Connecting...");

  bool connected;

  if (strlen(MQTT_USERNAME) > 0) {

    connected = mqttClient.connect(
      CLIENT_ID,
      MQTT_USERNAME,
      MQTT_PASSWORD,
      TOPIC_AVAILABILITY,
      0,
      true,
      "offline"
    );

  }
  else {

    connected = mqttClient.connect(
      CLIENT_ID,
      TOPIC_AVAILABILITY,
      0,
      true,
      "offline"
    );

  }

  if (connected) {

    Serial.println("[MQTT] Connected!");

    // Publish device availability
    mqttClient.publish(
      TOPIC_AVAILABILITY,
      "online",
      true
    );

    // Subscribe command topic
    mqttClient.subscribe(TOPIC_COMMAND, 0);

    // Initial relay status (retained for mobile app sync)
    mqttClient.publish(
      TOPIC_STATUS,
      relayActive ? "ON" : "OFF",
      true
    );

    Serial.println("[MQTT] Subscribed:");
    Serial.println(TOPIC_COMMAND);

  }
  else {

    Serial.print("[MQTT] Connection failed: ");
    Serial.println(mqttClient.state());

  }
}

// ============================================
// SETUP
// ============================================

void setup() {

  Serial.begin(115200);
  delay(100);

  // Initialize relay OFF
  setRelayHardware(false);

  Serial.println();
  Serial.println("================================");
  Serial.println(" WEMOS D1 MINI DOOR EXIT MQTT");
  Serial.println("================================");

  // MQTT configuration
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);

  mqttClient.setKeepAlive(30);
  mqttClient.setSocketTimeout(5);
  mqttClient.setBufferSize(256);

  // Connect WiFi
  connectWiFi();
}

// ============================================
// MAIN LOOP
// ============================================

void loop() {

  // Check WiFi connection
  checkWiFi();

  // MQTT connection management
  if (WiFi.status() == WL_CONNECTED) {

    if (!mqttClient.connected()) {

      unsigned long now = millis();

      if (now - lastMQTTAttempt >= MQTT_RECONNECT_INTERVAL) {

        lastMQTTAttempt = now;

        connectMQTT();
      }

    }
    else {

      mqttClient.loop();

    }
  }

  // Automatic relay OFF after OPEN_DURATION
  if (AUTO_OFF_ENABLED && relayActive) {

    if (millis() - relayStartTime >= OPEN_DURATION) {

      closeRelay();

    }
  }
}
