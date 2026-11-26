import os
import textwrap

def write_clean(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(textwrap.dedent(content).lstrip())

# 1. Java AppWidgetProvider (1-Tap MQTT TCP Publish + Toast Feedback)
write_clean(
    "android/app/src/main/java/com/smartlab/geo/DoorWidgetProvider.java",
    """
    package com.smartlab.geo;

    import android.app.PendingIntent;
    import android.appwidget.AppWidgetManager;
    import android.appwidget.AppWidgetProvider;
    import android.content.ComponentName;
    import android.content.Context;
    import android.content.Intent;
    import android.os.Handler;
    import android.os.Looper;
    import android.widget.RemoteViews;
    import android.widget.Toast;
    import java.io.ByteArrayOutputStream;
    import java.io.InputStream;
    import java.io.OutputStream;
    import java.net.InetSocketAddress;
    import java.net.Socket;
    import java.nio.charset.StandardCharsets;

    public class DoorWidgetProvider extends AppWidgetProvider {
        public static final String ACTION_OPEN_DOOR = "com.smartlab.geo.ACTION_OPEN_DOOR";

        @Override
        public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
            for (int appWidgetId : appWidgetIds) {
                updateWidgetUi(context, appWidgetManager, appWidgetId, "SIAP BUKA");
            }
        }

        private static void updateWidgetUi(Context context, AppWidgetManager mgr, int widgetId, String statusText) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.door_widget);
            views.setTextViewText(R.id.tv_widget_state, statusText);

            Intent intent = new Intent(context, DoorWidgetProvider.class);
            intent.setAction(ACTION_OPEN_DOOR);
            PendingIntent pendingIntent = PendingIntent.getBroadcast(
                context,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            views.setOnClickPendingIntent(R.id.btn_open_door_widget, pendingIntent);
            mgr.updateAppWidget(widgetId, views);
        }

        private static void updateAllWidgets(Context context, String statusText) {
            AppWidgetManager mgr = AppWidgetManager.getInstance(context);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(context, DoorWidgetProvider.class));
            for (int id : ids) {
                updateWidgetUi(context, mgr, id, statusText);
            }
        }

        @Override
        public void onReceive(Context context, Intent intent) {
            super.onReceive(context, intent);
            if (ACTION_OPEN_DOOR.equals(intent.getAction())) {
                final PendingResult result = goAsync();
                updateAllWidgets(context, "MEMBUKA PINTU...");

                new Thread(() -> {
                    boolean ok = sendRawMqttPublish("mqtt.vantara.my.id", 1883, "smartlab-geo/door/exit/command", "ON");
                    new Handler(Looper.getMainLooper()).post(() -> {
                        updateAllWidgets(context, ok ? "TERBUKA (ON)" : "GAGAL KONEK");
                        Toast.makeText(
                            context,
                            ok ? "SmartLab-GEO: Pintu Dibuka!" : "Gagal menghubungi broker MQTT",
                            Toast.LENGTH_SHORT
                        ).show();
                    });

                    try { Thread.sleep(1300); } catch (InterruptedException ignored) {}
                    new Handler(Looper.getMainLooper()).post(() -> updateAllWidgets(context, "SIAP BUKA"));
                    result.finish();
                }).start();
            }
        }

        private static boolean sendRawMqttPublish(String host, int port, String topic, String payload) {
            try (Socket socket = new Socket()) {
                socket.connect(new InetSocketAddress(host, port), 4000);
                socket.setSoTimeout(4000);
                OutputStream out = socket.getOutputStream();
                InputStream in = socket.getInputStream();

                // 1. MQTT v3.1.1 CONNECT Packet
                byte[] clientId = ("SLG_W_" + (System.currentTimeMillis() % 10000)).getBytes(StandardCharsets.UTF_8);
                ByteArrayOutputStream connectBody = new ByteArrayOutputStream();
                connectBody.write(new byte[]{0x00, 0x04, 'M', 'Q', 'T', 'T', 0x04, 0x02, 0x00, 0x0A});
                connectBody.write((clientId.length >> 8) & 0xFF);
                connectBody.write(clientId.length & 0xFF);
                connectBody.write(clientId);

                byte[] connectBytes = connectBody.toByteArray();
                out.write(0x10);
                out.write(connectBytes.length);
                out.write(connectBytes);
                out.flush();

                // 2. Read 4-byte CONNACK
                byte[] connack = new byte[4];
                int read = in.read(connack);
                if (read < 4 || connack[3] != 0) return false;

                // 3. MQTT PUBLISH Packet (QoS 0)
                byte[] topicBytes = topic.getBytes(StandardCharsets.UTF_8);
                byte[] payloadBytes = payload.getBytes(StandardCharsets.UTF_8);
                int remLen = 2 + topicBytes.length + payloadBytes.length;

                out.write(0x30);
                out.write(remLen);
                out.write((topicBytes.length >> 8) & 0xFF);
                out.write(topicBytes.length & 0xFF);
                out.write(topicBytes);
                out.write(payloadBytes);
                out.flush();

                Thread.sleep(150);
                // 4. MQTT DISCONNECT
                out.write(new byte[]{(byte) 0xE0, 0x00});
                out.flush();
                return true;
            } catch (Exception e) {
                return false;
            }
        }
    }
    """,
)

# 2. Drawables & XML Layouts (<?xml at byte 0)
write_clean(
    "android/app/src/main/res/drawable/widget_bg.xml",
    """
    <?xml version="1.0" encoding="utf-8"?>
    <shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
        <solid android:color="#0F172A" />
        <corners android:radius="18dp" />
        <stroke android:width="1dp" android:color="#334155" />
    </shape>
    """,
)

write_clean(
    "android/app/src/main/res/drawable/widget_btn_bg.xml",
    """
    <?xml version="1.0" encoding="utf-8"?>
    <shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
        <solid android:color="#2563EB" />
        <corners android:radius="12dp" />
    </shape>
    """,
)

write_clean(
    "android/app/src/main/res/layout/door_widget.xml",
    """
    <?xml version="1.0" encoding="utf-8"?>
    <LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:background="@drawable/widget_bg"
        android:gravity="center"
        android:orientation="vertical"
        android:padding="12dp">

        <TextView
            android:id="@+id/tv_widget_title"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="SmartLab-GEO Door"
            android:textColor="#94A3B8"
            android:textSize="11sp"
            android:textStyle="bold" />

        <Button
            android:id="@+id/btn_open_door_widget"
            android:layout_width="match_parent"
            android:layout_height="46dp"
            android:layout_marginTop="6dp"
            android:background="@drawable/widget_btn_bg"
            android:text="BUKA PINTU"
            android:textColor="#FFFFFF"
            android:textSize="13sp"
            android:textStyle="bold" />

        <TextView
            android:id="@+id/tv_widget_state"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:layout_marginTop="6dp"
            android:text="SIAP BUKA"
            android:textColor="#10B981"
            android:textSize="11sp"
            android:textStyle="bold" />
    </LinearLayout>
    """,
)

write_clean(
    "android/app/src/main/res/xml/door_widget_info.xml",
    """
    <?xml version="1.0" encoding="utf-8"?>
    <appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
        android:initialLayout="@layout/door_widget"
        android:minWidth="140dp"
        android:minHeight="105dp"
        android:resizeMode="horizontal|vertical"
        android:updatePeriodMillis="1800000"
        android:widgetCategory="home_screen" />
    """,
)

# 3. Patch AndroidManifest.xml
manifest_path = "android/app/src/main/AndroidManifest.xml"
with open(manifest_path, "r", encoding="utf-8") as f:
    content = f.read()

if "usesCleartextTraffic" not in content:
    content = content.replace(
        "<application",
        '<application android:usesCleartextTraffic="true"',
        1,
    )

widget_receiver = """
        <receiver
            android:name=".DoorWidgetProvider"
            android:exported="true">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
                <action android:name="com.smartlab.geo.ACTION_OPEN_DOOR" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/door_widget_info" />
        </receiver>
    </application>"""

if "DoorWidgetProvider" not in content:
    content = content.replace("</application>", widget_receiver, 1)

with open(manifest_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Successfully injected DoorWidgetProvider and patched AndroidManifest.xml")
