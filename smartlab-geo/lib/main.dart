import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:home_widget/home_widget.dart';
import 'services/home_widget_service.dart';
import 'services/mqtt_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await HomeWidgetService.init();
  runApp(const SmartLabGeoApp());
}

class SmartLabGeoApp extends StatelessWidget {
  const SmartLabGeoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SmartLab-GEO Door',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0F172A),
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF10B981),
          brightness: Brightness.dark,
        ),
      ),
      home: const DoorControlPage(),
    );
  }
}

class DoorControlPage extends StatefulWidget {
  const DoorControlPage({super.key});

  @override
  State<DoorControlPage> createState() => _DoorControlPageState();
}

class _DoorControlPageState extends State<DoorControlPage> {
  final MqttService _mqtt = MqttService();
  bool _isPressing = false;

  @override
  void initState() {
    super.initState();
    _mqtt.addListener(_onMqttStateChanged);
    _mqtt.init();
  }

  void _onMqttStateChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _mqtt.removeListener(_onMqttStateChanged);
    _mqtt.dispose();
    super.dispose();
  }

  Future<void> _triggerDoor(String cmd) async {
    HapticFeedback.mediumImpact();
    setState(() => _isPressing = true);
    final ok = await _mqtt.sendCommand(cmd);
    if (!mounted) return;
    setState(() => _isPressing = false);

    if (!ok && _mqtt.errorMessage != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(_mqtt.errorMessage!),
          backgroundColor: Colors.redAccent,
        ),
      );
    }
  }

  Future<void> _pinHomeScreenWidget() async {
    try {
      final supported = await HomeWidget.isRequestPinWidgetSupported();
      if (supported == true) {
        await HomeWidget.requestPinWidget(
          name: 'DoorWidgetProvider',
          androidName: 'DoorWidgetProvider',
          qualifiedAndroidName:
              'com.smartlab.smartlab_geo.DoorWidgetProvider',
        );
      } else {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Tekan tahan di layar utama (Home Screen) HP Anda -> pilih Widgets -> tambahkan SmartLab-GEO Door Exit.',
            ),
          ),
        );
      }
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Untuk memasang widget: tekan tahan layar Home Screen HP -> pilih menu Widgets -> cari SmartLab-GEO Door.',
          ),
        ),
      );
    }
  }

  void _openSettingsDialog() {
    final hostCtrl = TextEditingController(text: _mqtt.config.host);
    final portCtrl = TextEditingController(text: _mqtt.config.port.toString());
    final userCtrl = TextEditingController(text: _mqtt.config.username);
    final passCtrl = TextEditingController(text: _mqtt.config.password);
    final cmdCtrl = TextEditingController(text: _mqtt.config.topicCommand);
    final statCtrl = TextEditingController(text: _mqtt.config.topicStatus);
    final availCtrl =
        TextEditingController(text: _mqtt.config.topicAvailability);

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF1E293B),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 20,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Konfigurasi MQTT Broker',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      flex: 3,
                      child: TextField(
                        controller: hostCtrl,
                        decoration: const InputDecoration(
                          labelText: 'MQTT Host',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      flex: 1,
                      child: TextField(
                        controller: portCtrl,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Port',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: userCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Username (Opsional)',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(
                        controller: passCtrl,
                        obscureText: true,
                        decoration: const InputDecoration(
                          labelText: 'Password (Opsional)',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: cmdCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Topic Command',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: statCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Topic Status',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: availCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Topic Availability',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: () {
                      final newCfg = MqttConfig(
                        host: hostCtrl.text.trim(),
                        port: int.tryParse(portCtrl.text.trim()) ?? 1883,
                        username: userCtrl.text.trim(),
                        password: passCtrl.text.trim(),
                        topicCommand: cmdCtrl.text.trim(),
                        topicStatus: statCtrl.text.trim(),
                        topicAvailability: availCtrl.text.trim(),
                      );
                      Navigator.pop(ctx);
                      _mqtt.updateConfig(newCfg);
                    },
                    icon: const Icon(Icons.save_rounded),
                    label: const Text('Simpan & Hubungkan Ulang'),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final bool isDoorOpen = _mqtt.relayStatus == 'ON';
    final bool isWemosOnline = _mqtt.deviceAvailability == 'online';

    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'SmartLab-GEO',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 19),
            ),
            Text(
              'Wemos D1 Mini • Door Exit Controller',
              style: TextStyle(fontSize: 12, color: Colors.white60),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Pasang Widget di Layar HP',
            onPressed: _pinHomeScreenWidget,
            icon: const Icon(Icons.widgets_outlined),
          ),
          IconButton(
            tooltip: 'Pengaturan MQTT',
            onPressed: _openSettingsDialog,
            icon: const Icon(Icons.settings_outlined),
          ),
        ],
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          child: Column(
            children: [
              // 1. Kartu Status Koneksi Broker & Wemos
              _buildStatusHeader(isWemosOnline),
              const SizedBox(height: 24),

              // 2. Tombol Utama Buka Pintu (Big Interactive Widget Button)
              Expanded(
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      GestureDetector(
                        onTap: () => _triggerDoor('ON'),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 220),
                          width: _isPressing ? 210 : 225,
                          height: _isPressing ? 210 : 225,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: isDoorOpen
                                  ? [
                                      const Color(0xFF10B981),
                                      const Color(0xFF059669),
                                    ]
                                  : [
                                      const Color(0xFF2563EB),
                                      const Color(0xFF1D4ED8),
                                    ],
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: (isDoorOpen
                                        ? const Color(0xFF10B981)
                                        : const Color(0xFF3B82F6))
                                    .withValues(alpha: 0.45),
                                blurRadius: isDoorOpen ? 42 : 28,
                                spreadRadius: isDoorOpen ? 10 : 3,
                              ),
                            ],
                            border: Border.all(
                              color: Colors.white24,
                              width: 3,
                            ),
                          ),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                isDoorOpen
                                    ? Icons.lock_open_rounded
                                    : Icons.meeting_room_rounded,
                                size: 68,
                                color: Colors.white,
                              ),
                              const SizedBox(height: 10),
                              Text(
                                isDoorOpen ? 'TERBUKA' : 'BUKA PINTU',
                                style: const TextStyle(
                                  fontSize: 21,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 1.2,
                                  color: Colors.white,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                isDoorOpen
                                    ? 'Relay Status: ON'
                                    : 'Sentuh untuk buka',
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: Colors.white70,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 24),

                      // Tombol Manual ON / OFF & Pintasan Pasang Home Screen Widget
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          FilledButton.tonalIcon(
                            onPressed: () => _triggerDoor('ON'),
                            icon: const Icon(Icons.flash_on_rounded, size: 18),
                            label: const Text('Kirim ON'),
                          ),
                          const SizedBox(width: 12),
                          OutlinedButton.icon(
                            onPressed: () => _triggerDoor('OFF'),
                            icon: const Icon(Icons.power_settings_new_rounded,
                                size: 18),
                            label: const Text('Kirim OFF'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      TextButton.icon(
                        onPressed: _pinHomeScreenWidget,
                        icon: const Icon(Icons.add_to_home_screen_rounded,
                            size: 18),
                        label: const Text(
                            'Tambah Tombol Widget ke Layar Depan HP'),
                      ),
                    ],
                  ),
                ),
              ),

              // 3. Log Aktivitas MQTT Real-Time
              _buildMqttLogPanel(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStatusHeader(bool isWemosOnline) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white10),
      ),
      child: Row(
        children: [
          Expanded(
            child: Row(
              children: [
                Container(
                  width: 11,
                  height: 11,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: _mqtt.isBrokerConnected
                        ? const Color(0xFF10B981)
                        : (_mqtt.isConnecting
                            ? Colors.amber
                            : Colors.redAccent),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _mqtt.isBrokerConnected
                            ? 'MQTT Terhubung'
                            : (_mqtt.isConnecting
                                ? 'Menghubungkan...'
                                : 'MQTT Terputus'),
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 13,
                        ),
                      ),
                      Text(
                        _mqtt.deviceIp != '-'
                            ? '${_mqtt.config.host} • Wemos IP: ${_mqtt.deviceIp}'
                            : '${_mqtt.config.host}:${_mqtt.config.port}',
                        style: const TextStyle(
                          fontSize: 11,
                          color: Colors.white54,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Container(
            width: 1,
            height: 32,
            color: Colors.white12,
            margin: const EdgeInsets.symmetric(horizontal: 12),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: (isWemosOnline
                      ? const Color(0xFF10B981)
                      : Colors.orangeAccent)
                  .withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              children: [
                Icon(
                  Icons.memory_rounded,
                  size: 15,
                  color: isWemosOnline
                      ? const Color(0xFF10B981)
                      : Colors.orangeAccent,
                ),
                const SizedBox(width: 6),
                Text(
                  'Wemos: ${_mqtt.deviceAvailability.toUpperCase()}',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: isWemosOnline
                        ? const Color(0xFF10B981)
                        : Colors.orangeAccent,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMqttLogPanel() {
    return Container(
      height: 125,
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Log Aktivitas MQTT',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                  color: Colors.white70,
                ),
              ),
              if (!_mqtt.isBrokerConnected)
                InkWell(
                  onTap: _mqtt.connect,
                  child: const Text(
                    'Reconnect',
                    style: TextStyle(
                      fontSize: 12,
                      color: Color(0xFF38BDF8),
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
            ],
          ),
          const Divider(height: 12, color: Colors.white12),
          Expanded(
            child: _mqtt.logs.isEmpty
                ? const Center(
                    child: Text(
                      'Belum ada aktivitas MQTT',
                      style: TextStyle(fontSize: 11, color: Colors.white38),
                    ),
                  )
                : ListView.builder(
                    itemCount: _mqtt.logs.length,
                    itemBuilder: (context, idx) {
                      final entry = _mqtt.logs[idx];
                      final timeStr =
                          '${entry.timestamp.hour.toString().padLeft(2, '0')}:'
                          '${entry.timestamp.minute.toString().padLeft(2, '0')}:'
                          '${entry.timestamp.second.toString().padLeft(2, '0')}';
                      return Padding(
                        padding: const EdgeInsets.symmetric(vertical: 2),
                        child: Text(
                          '[$timeStr] ${entry.isOutgoing ? "TX ->" : "RX <-"} ${entry.topic} : ${entry.payload}',
                          style: TextStyle(
                            fontSize: 11,
                            fontFamily: 'monospace',
                            color: entry.isOutgoing
                                ? const Color(0xFF38BDF8)
                                : const Color(0xFF34D399),
                          ),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

