import 'package:home_widget/home_widget.dart';
import 'mqtt_service.dart';

/// Callback background saat user menekan tombol "BUKA PINTU"
/// langsung dari Widget di Home Screen HP Android/iOS.
@pragma('vm:entry-point')
Future<void> homeWidgetBackgroundCallback(Uri? uri) async {
  if (uri == null) return;

  if (uri.host == 'opendoor') {
    await HomeWidget.saveWidgetData<String>('door_state', 'MEMBUKA...');
    await HomeWidget.updateWidget(
      name: 'DoorWidgetProvider',
      androidName: 'DoorWidgetProvider',
      iOSName: 'DoorWidget',
    );

    final ok = await MqttService.publishQuickCommandFromBackground('ON');

    await HomeWidget.saveWidgetData<String>(
      'door_state',
      ok ? 'TERBUKA (ON)' : 'GAGAL KONEK',
    );
    await HomeWidget.updateWidget(
      name: 'DoorWidgetProvider',
      androidName: 'DoorWidgetProvider',
      iOSName: 'DoorWidget',
    );

    // Karena di Wemos pintu otomatis terkunci kembali setelah 1 detik:
    await Future.delayed(const Duration(milliseconds: 1200));
    await HomeWidget.saveWidgetData<String>('door_state', 'SIAP BUKA');
    await HomeWidget.updateWidget(
      name: 'DoorWidgetProvider',
      androidName: 'DoorWidgetProvider',
      iOSName: 'DoorWidget',
    );
  }
}

class HomeWidgetService {
  static Future<void> init() async {
    await HomeWidget.registerInteractivityCallback(homeWidgetBackgroundCallback);
    await updateWidgetState(status: 'OFF', availability: 'online');
  }

  static Future<void> updateWidgetState({
    required String status,
    required String availability,
  }) async {
    try {
      final stateLabel =
          status == 'ON' ? 'TERBUKA (ON)' : 'SIAP BUKA';
      final availLabel =
          availability == 'online' ? 'Wemos Online' : 'Wemos $availability';

      await HomeWidget.saveWidgetData<String>('door_state', stateLabel);
      await HomeWidget.saveWidgetData<String>('device_avail', availLabel);
      await HomeWidget.updateWidget(
        name: 'DoorWidgetProvider',
        androidName: 'DoorWidgetProvider',
        iOSName: 'DoorWidget',
      );
    } catch (_) {
      // Abaikan jika dijalankan di platform yang belum memasang widget
    }
  }
}

