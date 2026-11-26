# SmartLab-GEO - Flutter MQTT + Home Screen Widget

Aplikasi mobile (Android & iOS) berbasis **Flutter** untuk mengontrol dan memantau **Wemos D1 Mini Door Exit** ([wemos.ino](../wemos.ino)) secara real-time melalui protokol **MQTT TCP (`mqtt.vantara.my.id:1883`)**, dilengkapi fitur **Tombol Widget di Layar Utama HP (Home Screen Widget)** untuk membuka pintu dalam 1 sentuhan tanpa perlu membuka aplikasi.

---

## Topic MQTT (`smartlab-geo`)
- **Command:** `smartlab-geo/door/exit/command` (`ON` / `OFF`)
- **Status:** `smartlab-geo/door/exit/status` (`ON` / `OFF`)
- **Availability:** `smartlab-geo/door/exit/availability` (`online` / `offline`)

---

## Cara Cetak File `.apk` Otomatis via GitHub Actions (Tanpa Install Flutter di PC)

File workflow otomatis sudah disiapkan di [.github/workflows/build-apk.yml](../.github/workflows/build-apk.yml). Server GitHub akan otomatis men-generate kerangka Android, menyuntikkan konfigurasi *Home Screen Widget* ke `AndroidManifest.xml`, dan meng-compile file **`SmartLab-GEO.apk`**.

### Langkah-langkah:
1. Buat repository baru di GitHub (misalnya bernama `smartlab-geo`).
2. Buka terminal PowerShell di folder `E:\Delfin\Product Engineer\wemos`, lalu jalankan perintah berikut untuk meng-upload kode ke GitHub:
   ```powershell
   git init
   git add .
   git commit -m "Initial SmartLab-GEO Wemos & Flutter App"
   git branch -M main
   git remote add origin https://github.com/USERNAME_ANDA/smartlab-geo.git
   git push -u origin main
   ```
3. Buka halaman repository GitHub Anda di browser -> klik tab **Actions** di bagian atas.
4. Anda akan melihat proses **"Build SmartLab-GEO Android APK"** sedang berjalan (tunggu sekitar 3–4 menit hingga centang hijau).
5. Klik hasil build tersebut -> gulir ke bagian paling bawah (**Artifacts**) -> klik **`SmartLab-GEO-APK`** untuk mengunduh file **`SmartLab-GEO.apk`** dan install di HP Android Anda!
