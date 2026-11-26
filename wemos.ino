
#include <ESP8266WiFi.h>
#include <ESP8266mDNS.h>
#include <WiFiUdp.h>
#include <ArduinoOTA.h>
#include <ESP8266WebServer.h>
#include <ESP8266HTTPUpdateServer.h>
#include <PubSubClient.h>

// ============================================
// WIFI CONFIGURATION
// ============================================

const char* WIFI_SSID     = "Lab GEO 2.4GHz";
const char* WIFI_PASSWORD = "#WelcomeGEOUNO";

// ============================================
// OTA CONFIGURATION (Arduino IDE & Web Browser)
// ============================================

const char* OTA_HOSTNAME = "SmartLab-GEO-DoorExit";
const char* OTA_WEB_USER = "admin";
const char* OTA_PASSWORD = "admin";

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

const char* TOPIC_IP =
  "smartlab-geo/door/exit/ip";

const char* TOPIC_DELAY =
  "smartlab-geo/door/exit/delay";

// ============================================
// HARDWARE CONFIGURATION
// ============================================

#define RELAY_PIN D5

// Modul relay biru standar 5V (Active LOW)
// Menggunakan mode Open-Drain agar GPIO 3.3V Wemos kuat mematikan modul relay 5V:
// - ON  : OUTPUT + LOW (menarik pin IN ke GND -> relay aktif)
// - OFF : INPUT / High-Z (memutus arus dari 5V -> relay benar-benar mati)
#define AUTO_OFF_ENABLED true

// Durasi Relay ON dinamis (default: 1000 ms, bisa diubah via MQTT smartlab-geo/door/exit/delay)
// Nilai 0 = Mode Manual (menyala terus sampai dikirim perintah OFF)
unsigned long openDuration = 1000;

// ============================================
// GLOBAL VARIABLES
// ============================================

WiFiClient espClient;
PubSubClient mqttClient(espClient);

ESP8266WebServer httpServer(80);
ESP8266HTTPUpdateServer httpUpdater;

bool relayActive = false;
bool otaInitialized = false;

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
    else if (message.startsWith("ON:")) {

      long customMs = message.substring(3).toInt();
      if (customMs >= 0 && customMs <= 300000) {
        openDuration = (unsigned long)customMs;
        Serial.print("[DELAY] Set via ON command (ms): ");
        Serial.println(openDuration);
      }
      openDoor();

    }
    else if (message == "OFF") {

      closeRelay();

    }
    else {

      Serial.println("[MQTT] Invalid command. Use ON or OFF.");

    }
  }
  else if (String(topic) == TOPIC_DELAY) {

    long newDelay = message.toInt();
    if (newDelay >= 0 && newDelay <= 300000) {
      openDuration = (unsigned long)newDelay;
      Serial.print("[DELAY] Updated dynamic auto-OFF delay (ms): ");
      Serial.println(openDuration);
    }

  }
}

// ============================================
// OTA SETUP (Arduino IDE Network Port & Web /update)
// ============================================

void setupOTA() {
  if (otaInitialized) return;

  // 1. Konfigurasi ArduinoOTA (Upload langsung via WiFi dari Arduino IDE)
  ArduinoOTA.setHostname(OTA_HOSTNAME);
  if (strlen(OTA_PASSWORD) > 0) {
    ArduinoOTA.setPassword(OTA_PASSWORD);
  }

  ArduinoOTA.onStart([]() {
    // Pastikan relay dimatikan demi keamanan saat proses flash firmware dimulai
    closeRelay();
    Serial.println("[OTA] Memulai update firmware...");
  });

  ArduinoOTA.onEnd([]() {
    Serial.println("\n[OTA] Update selesai! Rebooting...");
  });

  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    Serial.printf("[OTA] Progress: %u%%\r", (progress / (total / 100)));
  });

  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("\n[OTA] Error[%u]: ", error);
    if (error == OTA_AUTH_ERROR) Serial.println("Auth Failed");
    else if (error == OTA_BEGIN_ERROR) Serial.println("Begin Failed");
    else if (error == OTA_CONNECT_ERROR) Serial.println("Connect Failed");
    else if (error == OTA_RECEIVE_ERROR) Serial.println("Receive Failed");
    else if (error == OTA_END_ERROR) Serial.println("End Failed");
  });

  ArduinoOTA.begin();

  // 2. Konfigurasi Web OTA (Upload file .bin via Browser di http://<IP_WEMOS>/update)
  httpUpdater.setup(&httpServer, "/update", OTA_WEB_USER, OTA_PASSWORD);

  httpServer.on("/", HTTP_GET, []() {
    String html = "<html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
                  "<title>SmartLab-GEO OTA & Control</title>"
                  "<style>body{font-family:sans-serif;background:#050914;color:#f8fafc;text-align:center;padding:24px;}"
                  ".card{background:#131c31;padding:24px;border-radius:20px;max-width:400px;margin:auto;border:1px solid #1e293b;}"
                  "a.btn,button.btn{display:block;width:100%;box-sizing:border-box;margin-top:12px;padding:14px 20px;background:#2563eb;color:#fff;"
                  "text-decoration:none;border:none;border-radius:12px;font-weight:bold;font-size:15px;cursor:pointer;}"
                  "a.btn-ota{background:#334155;}</style></head><body>"
                  "<div class='card'><h2>SmartLab-GEO Door Exit</h2>"
                  "<p>IP Address: <b>" + WiFi.localIP().toString() + "</b></p>"
                  "<p>Status Relay: <b>" + String(relayActive ? "ON (TERBUKA)" : "OFF (TERKUNCI)") + "</b></p>"
                  "<a class='btn' href='/api/open'>BUKA PINTU SEKARANG (ON)</a>"
                  "<a class='btn btn-ota' href='/update'>Update Firmware (Web OTA)</a></div></body></html>";
    httpServer.send(200, "text/html", html);
  });

  // REST API lokal dengan CORS agar React PWA & iPhone Shortcuts juga bisa memicu via WiFi lokal
  httpServer.on("/api/open", HTTP_ANY, []() {
    httpServer.sendHeader("Access-Control-Allow-Origin", "*");
    openDoor();
    httpServer.send(200, "application/json", "{\"status\":\"ON\"}");
  });

  httpServer.on("/api/close", HTTP_ANY, []() {
    httpServer.sendHeader("Access-Control-Allow-Origin", "*");
    closeRelay();
    httpServer.send(200, "application/json", "{\"status\":\"OFF\"}");
  });

  httpServer.on("/api/status", HTTP_GET, []() {
    httpServer.sendHeader("Access-Control-Allow-Origin", "*");
    String json = "{\"status\":\"" + String(relayActive ? "ON" : "OFF") + "\",\"ip\":\"" + WiFi.localIP().toString() + "\",\"delay\":" + String(openDuration) + "}";
    httpServer.send(200, "application/json", json);
  });

  httpServer.on("/api/delay", HTTP_ANY, []() {
    httpServer.sendHeader("Access-Control-Allow-Origin", "*");
    if (httpServer.hasArg("ms")) {
      long newMs = httpServer.arg("ms").toInt();
      if (newMs >= 0 && newMs <= 300000) {
        openDuration = (unsigned long)newMs;
        if (mqttClient.connected()) {
          String msStr = String(openDuration);
          mqttClient.publish(TOPIC_DELAY, msStr.c_str(), true);
        }
      }
    }
    String json = "{\"delay\":" + String(openDuration) + "}";
    httpServer.send(200, "application/json", json);
  });

  httpServer.begin();
  otaInitialized = true;

  Serial.println("[WIFI] Connected! IP: " + WiFi.localIP().toString());
  Serial.println("[OTA] ArduinoOTA Ready! Hostname: " + String(OTA_HOSTNAME));
  Serial.println("[OTA] Web OTA Ready! Buka: http://" + WiFi.localIP().toString() + "/update");
}

// ============================================
// WIFI CONNECTION
// ============================================

void connectWiFi() {

  Serial.println();
  Serial.println("[WIFI] Connecting...");

  WiFi.mode(WIFI_STA);
  WiFi.hostname(OTA_HOSTNAME);
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

    // Subscribe command & dynamic delay topics
    mqttClient.subscribe(TOPIC_COMMAND, 0);
    mqttClient.subscribe(TOPIC_DELAY, 0);

    // Initial relay status (retained for mobile app sync)
    mqttClient.publish(
      TOPIC_STATUS,
      relayActive ? "ON" : "OFF",
      true
    );

    // Publish local IP address so user knows where to access Web OTA
    String ipStr = WiFi.localIP().toString();
    mqttClient.publish(
      TOPIC_IP,
      ipStr.c_str(),
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

  // MQTT & OTA connection management
  if (WiFi.status() == WL_CONNECTED) {

    if (!otaInitialized) {
      setupOTA();
    }

    ArduinoOTA.handle();
    httpServer.handleClient();

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

  // Automatic relay OFF after openDuration (jika openDuration > 0)
  if (AUTO_OFF_ENABLED && openDuration > 0 && relayActive) {

    if (millis() - relayStartTime >= openDuration) {

      closeRelay();

    }
  }
}
