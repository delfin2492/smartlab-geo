# SmartLab-GEO • React Mobile PWA & Wemos D1 Mini MQTT + OTA

Sistem kontrol pintu pintar (**Smart Door Exit**) berbasis **Wemos D1 Mini (ESP8266)** dan **React Progressive Web App (PWA)** dengan tampilan dashboard mobile modern (Android & iOS).

---

## Fitur Utama React PWA (`smartlab-geo/`)
1. **Desain Mobile Smart Home Profesional**:
   - Tombol utama **"BUKA PINTU"** (*tactile glowing orb*) dengan animasi cincin, efek getar (*haptic*), dan status *real-time* (`TERBUKA` hijau / `TERKUNCI` biru).
   - Indikator *real-time* status koneksi MQTT (`ws://mqtt.vantara.my.id:9001`), status perangkat `WEMOS: ONLINE / OFFLINE`, serta alamat IP lokal Wemos.
   - Ringkasan telemetri pintu (Status Relay, Jumlah Akses Dibuka, Waktu Terakhir Buka).
2. **Bisa Di-install di Android & iPhone (PWA + 1-Tap Home Screen Shortcut)**:
   - Buka web di Chrome (Android) atau Safari (iPhone) -> pilih **"Tambahkan ke Layar Utama" (Add to Home Screen)**.
   - Aplikasi akan tampil *full-screen* tanpa *address bar* persis seperti aplikasi native.
   - Mendukung **Mode 1-Tap Widget** (di tab *Pengaturan & OTA* atau shortcut `?action=unlock`): begitu ikon di layar utama HP disentuh, pintu langsung terbuka otomatis!
3. **Update Firmware Wemos via WiFi (OTA)**:
   - Mendukung **ArduinoOTA** (upload langsung dari Arduino IDE via Network Port `SmartLab-GEO-DoorExit`) dan **Web OTA** (`http://<IP_WEMOS>/update`, user: `admin`, pass: `admin`).

---

## Topic MQTT (`mqtt.vantara.my.id`)
- **TCP Port (Wemos):** `1883`
- **WebSocket Port (React PWA):** `9001` (`ws://mqtt.vantara.my.id:9001`)
- **Command Topic:** `smartlab-geo/door/exit/command` (`ON` / `OFF`)
- **Status Topic:** `smartlab-geo/door/exit/status` (`ON` / `OFF`)
- **Availability Topic:** `smartlab-geo/door/exit/availability` (`online` / `offline`)
- **Local IP Topic:** `smartlab-geo/door/exit/ip`

---

## Cara Menjalankan React PWA di PC & HP

Di dalam folder `smartlab-geo`, jalankan:
```bash
npm install
npm run dev
```
- **Buka di PC:** `http://localhost:5173`
- **Buka di HP (Android / iPhone):** Buka link `Network: http://192.168.x.x:5173` yang muncul di terminal, lalu pilih **Add to Home Screen** di browser HP Anda.

