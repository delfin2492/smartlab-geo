import 'dart:async';
import 'dart:io';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:mqtt_client/mqtt_client.dart';
import 'package:mqtt_client/mqtt_server_client.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'home_widget_service.dart';

class MqttConfig {
  final String host;
  final int port;
  final String username;
  final String password;
  final String topicCommand;
  final String topicStatus;
  final String topicAvailability;
  final String topicIp;

  const MqttConfig({
    this.host = 'mqtt.vantara.my.id',
    this.port = 1883,
    this.username = '',
    this.password = '',
    this.topicCommand = 'smartlab-geo/door/exit/command',
    this.topicStatus = 'smartlab-geo/door/exit/status',
    this.topicAvailability = 'smartlab-geo/door/exit/availability',
    this.topicIp = 'smartlab-geo/door/exit/ip',
  });

  static Future<MqttConfig> load() async {
    final prefs = await SharedPreferences.getInstance();
    return MqttConfig(
      host: prefs.getString('mqtt_host') ?? 'mqtt.vantara.my.id',
      port: prefs.getInt('mqtt_port') ?? 1883,
      username: prefs.getString('mqtt_username') ?? '',
      password: prefs.getString('mqtt_password') ?? '',
      topicCommand:
          prefs.getString('topic_command') ?? 'smartlab-geo/door/exit/command',
      topicStatus:
          prefs.getString('topic_status') ?? 'smartlab-geo/door/exit/status',
      topicAvailability: prefs.getString('topic_availability') ??
          'smartlab-geo/door/exit/availability',
    );
  }

  Future<void> save() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('mqtt_host', host);
    await prefs.setInt('mqtt_port', port);
    await prefs.setString('mqtt_username', username);
    await prefs.setString('mqtt_password', password);
    await prefs.setString('topic_command', topicCommand);
    await prefs.setString('topic_status', topicStatus);
    await prefs.setString('topic_availability', topicAvailability);
  }
}

class MqttLogEntry {
  final DateTime timestamp;
  final String topic;
  final String payload;
  final bool isOutgoing;

  MqttLogEntry({
    required this.timestamp,
    required this.topic,
    required this.payload,
    this.isOutgoing = false,
  });
}

class MqttService extends ChangeNotifier {
  MqttServerClient? _client;
  MqttConfig config = const MqttConfig();

  bool isBrokerConnected = false;
  bool isConnecting = false;
  String deviceAvailability = 'unknown'; // 'online', 'offline', 'unknown'
  String relayStatus = 'OFF'; // 'ON' atau 'OFF'
  String deviceIp = '-';
  String? errorMessage;

  final List<MqttLogEntry> logs = [];
  StreamSubscription? _subscription;
  Timer? _reconnectTimer;

  Future<void> init() async {
    config = await MqttConfig.load();
    await connect();
  }

  Future<void> updateConfig(MqttConfig newConfig) async {
    await newConfig.save();
    config = newConfig;
    disconnect();
    await connect();
  }

  void _addLog(String topic, String payload, {bool isOutgoing = false}) {
    logs.insert(
      0,
      MqttLogEntry(
        timestamp: DateTime.now(),
        topic: topic,
        payload: payload,
        isOutgoing: isOutgoing,
      ),
    );
    if (logs.length > 50) {
      logs.removeLast();
    }
    notifyListeners();
  }

  Future<void> connect() async {
    if (isConnecting || isBrokerConnected) return;

    isConnecting = true;
    errorMessage = null;
    notifyListeners();

    final clientId =
        'SmartLabGeo_Mobile_${Random().nextInt(99999).toString().padLeft(5, '0')}';

    final client = MqttServerClient.withPort(
      config.host,
      clientId,
      config.port,
    );

    client.logging(on: false);
    client.keepAlivePeriod = 30;
    client.connectTimeoutPeriod = 5000;
    client.autoReconnect = true;
    client.onConnected = _onConnected;
    client.onDisconnected = _onDisconnected;
    client.onAutoReconnect = () {
      isConnecting = true;
      notifyListeners();
    };
    client.onAutoReconnected = _onConnected;

    final connMessage = MqttConnectMessage()
        .withClientIdentifier(clientId)
        .startClean()
        .withWillQos(MqttQos.atLeastOnce);

    client.connectionMessage = connMessage;
    _client = client;

    try {
      if (config.username.isNotEmpty) {
        await client.connect(config.username, config.password);
      } else {
        await client.connect();
      }
    } on NoConnectionException catch (e) {
      errorMessage = 'Gagal terhubung ke broker: $e';
      client.disconnect();
    } on SocketException catch (e) {
      errorMessage = 'Kesalahan jaringan: ${e.message}';
      client.disconnect();
    } catch (e) {
      errorMessage = 'Error MQTT: $e';
      client.disconnect();
    }

    if (client.connectionStatus?.state == MqttConnectionState.connected) {
      _setupListeners();
    } else {
      isConnecting = false;
      isBrokerConnected = false;
      notifyListeners();
      _scheduleReconnect();
    }
  }

  void _onConnected() {
    isConnecting = false;
    isBrokerConnected = true;
    errorMessage = null;
    _reconnectTimer?.cancel();

    _client?.subscribe(config.topicStatus, MqttQos.atMostOnce);
    _client?.subscribe(config.topicAvailability, MqttQos.atMostOnce);
    _client?.subscribe(config.topicIp, MqttQos.atMostOnce);

    _addLog('SYSTEM', 'Terhubung ke ${config.host}:${config.port}');
    HomeWidgetService.updateWidgetState(
      status: relayStatus,
      availability: deviceAvailability,
    );
    notifyListeners();
  }

  void _onDisconnected() {
    isConnecting = false;
    isBrokerConnected = false;
    _addLog('SYSTEM', 'Terputus dari broker MQTT');
    notifyListeners();
  }

  void _scheduleReconnect() {
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(const Duration(seconds: 5), () {
      if (!isBrokerConnected && !isConnecting) {
        connect();
      }
    });
  }

  void _setupListeners() {
    _subscription?.cancel();
    _subscription = _client?.updates?.listen(
      (List<MqttReceivedMessage<MqttMessage?>>? messages) {
        if (messages == null || messages.isEmpty) return;

        for (final msg in messages) {
          final recMess = msg.payload as MqttPublishMessage;
          final payload = MqttPublishPayload.bytesToStringAsString(
            recMess.payload.message,
          ).trim();

          final topic = msg.topic;
          _addLog(topic, payload, isOutgoing: false);

          if (topic == config.topicStatus) {
            relayStatus = payload.toUpperCase();
            HomeWidgetService.updateWidgetState(
              status: relayStatus,
              availability: deviceAvailability,
            );
          } else if (topic == config.topicAvailability) {
            deviceAvailability = payload.toLowerCase();
            HomeWidgetService.updateWidgetState(
              status: relayStatus,
              availability: deviceAvailability,
            );
          } else if (topic == config.topicIp) {
            deviceIp = payload;
          }
          notifyListeners();
        }
      },
    );
  }

  Future<bool> sendCommand(String command) async {
    if (_client == null || !isBrokerConnected) {
      await connect();
    }

    if (_client?.connectionStatus?.state != MqttConnectionState.connected) {
      errorMessage = 'Belum terhubung ke broker MQTT';
      notifyListeners();
      return false;
    }

    final builder = MqttClientPayloadBuilder();
    builder.addString(command);

    _client!.publishMessage(
      config.topicCommand,
      MqttQos.atLeastOnce,
      builder.payload!,
      retain: false,
    );

    _addLog(config.topicCommand, command, isOutgoing: true);
    return true;
  }

  /// Fungsi sekali-jalan (one-shot) yang dipanggil langsung dari
  /// Tombol Widget di Home Screen HP tanpa perlu membuka aplikasi.
  static Future<bool> publishQuickCommandFromBackground(String command) async {
    final cfg = await MqttConfig.load();
    final clientId =
        'SmartLabGeo_Widget_${Random().nextInt(99999).toString().padLeft(5, '0')}';

    final client = MqttServerClient.withPort(cfg.host, clientId, cfg.port);
    client.logging(on: false);
    client.keepAlivePeriod = 10;
    client.connectTimeoutPeriod = 4000;

    try {
      if (cfg.username.isNotEmpty) {
        await client.connect(cfg.username, cfg.password);
      } else {
        await client.connect();
      }

      if (client.connectionStatus?.state == MqttConnectionState.connected) {
        final builder = MqttClientPayloadBuilder()..addString(command);
        client.publishMessage(
          cfg.topicCommand,
          MqttQos.atLeastOnce,
          builder.payload!,
          retain: false,
        );
        // Beri waktu singkat agar paket TCP terkirim sebelum disconnect
        await Future.delayed(const Duration(milliseconds: 350));
        client.disconnect();
        return true;
      }
    } catch (_) {
      client.disconnect();
    }
    return false;
  }

  void disconnect() {
    _reconnectTimer?.cancel();
    _subscription?.cancel();
    _client?.disconnect();
    isBrokerConnected = false;
    isConnecting = false;
    notifyListeners();
  }

  @override
  void dispose() {
    disconnect();
    super.dispose();
  }
}

