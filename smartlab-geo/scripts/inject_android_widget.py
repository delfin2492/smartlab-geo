import os
import textwrap

def write_clean(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(textwrap.dedent(content).lstrip())

# 1. Java AppWidgetProvider (Desain Circular Glowing Orb + 1-Tap MQTT Publish)
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
    import android.graphics.Color;
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

        private static final int STATE_STANDBY = 0;
        private static final int STATE_SENDING = 1;
        private static final int STATE_OPEN = 2;
        private static final int STATE_ERROR = 3;

        @Override
        public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
            for (int appWidgetId : appWidgetIds) {
                updateWidgetUi(context, appWidgetManager, appWidgetId, STATE_STANDBY);
            }
        }

        private static void updateWidgetUi(Context context, AppWidgetManager mgr, int widgetId, int state) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.door_widget);

            if (state == STATE_OPEN) {
                views.setImageViewResource(R.id.img_orb_ring, R.drawable.widget_orb_ring_green);
                views.setImageViewResource(R.id.img_orb_core, R.drawable.widget_orb_btn_green);
                views.setImageViewResource(R.id.img_orb_icon, R.drawable.ic_widget_unlock);
                views.setTextViewText(R.id.tv_orb_action, "TERBUKA");
                views.setTextViewText(R.id.tv_orb_sub, "Relay ON");
                views.setTextViewText(R.id.tv_widget_state, "● AKSES TERBUKA");
                views.setTextColor(R.id.tv_widget_state, Color.parseColor("#34D399"));
            } else if (state == STATE_SENDING) {
                views.setImageViewResource(R.id.img_orb_ring, R.drawable.widget_orb_ring_green);
                views.setImageViewResource(R.id.img_orb_core, R.drawable.widget_orb_btn_blue);
                views.setImageViewResource(R.id.img_orb_icon, R.drawable.ic_widget_unlock);
                views.setTextViewText(R.id.tv_orb_action, "MEMBUKA");
                views.setTextViewText(R.id.tv_orb_sub, "Mengirim...");
                views.setTextViewText(R.id.tv_widget_state, "● MENGHUBUNGI...");
                views.setTextColor(R.id.tv_widget_state, Color.parseColor("#38BDF8"));
            } else if (state == STATE_ERROR) {
                views.setImageViewResource(R.id.img_orb_ring, R.drawable.widget_orb_ring_blue);
                views.setImageViewResource(R.id.img_orb_core, R.drawable.widget_orb_btn_blue);
                views.setImageViewResource(R.id.img_orb_icon, R.drawable.ic_widget_key);
                views.setTextViewText(R.id.tv_orb_action, "BUKA PINTU");
                views.setTextViewText(R.id.tv_orb_sub, "Coba Lagi");
                views.setTextViewText(R.id.tv_widget_state, "● GAGAL KONEK");
                views.setTextColor(R.id.tv_widget_state, Color.parseColor("#FB7185"));
            } else {
                views.setImageViewResource(R.id.img_orb_ring, R.drawable.widget_orb_ring_blue);
                views.setImageViewResource(R.id.img_orb_core, R.drawable.widget_orb_btn_blue);
                views.setImageViewResource(R.id.img_orb_icon, R.drawable.ic_widget_key);
                views.setTextViewText(R.id.tv_orb_action, "BUKA PINTU");
                views.setTextViewText(R.id.tv_orb_sub, "Sentuh");
                views.setTextViewText(R.id.tv_widget_state, "● SIAP BUKA");
                views.setTextColor(R.id.tv_widget_state, Color.parseColor("#34D399"));
            }

            Intent intent = new Intent(context, DoorWidgetProvider.class);
            intent.setAction(ACTION_OPEN_DOOR);
            PendingIntent pendingIntent = PendingIntent.getBroadcast(
                context,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            views.setOnClickPendingIntent(R.id.orb_click_container, pendingIntent);
            views.setOnClickPendingIntent(R.id.widget_root_card, pendingIntent);
            mgr.updateAppWidget(widgetId, views);
        }

        private static void updateAllWidgets(Context context, int state) {
            AppWidgetManager mgr = AppWidgetManager.getInstance(context);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(context, DoorWidgetProvider.class));
            for (int id : ids) {
                updateWidgetUi(context, mgr, id, state);
            }
        }

        @Override
        public void onReceive(Context context, Intent intent) {
            super.onReceive(context, intent);
            if (ACTION_OPEN_DOOR.equals(intent.getAction())) {
                final PendingResult result = goAsync();
                updateAllWidgets(context, STATE_SENDING);

                new Thread(() -> {
                    boolean ok = sendRawMqttPublish("mqtt.vantara.my.id", 1883, "smartlab-geo/door/exit/command", "ON");
                    new Handler(Looper.getMainLooper()).post(() -> {
                        updateAllWidgets(context, ok ? STATE_OPEN : STATE_ERROR);
                        Toast.makeText(
                            context,
                            ok ? "SmartLab-GEO: Pintu Terbuka (ON)" : "Gagal menghubungi broker MQTT",
                            Toast.LENGTH_SHORT
                        ).show();
                    });

                    try { Thread.sleep(1350); } catch (InterruptedException ignored) {}
                    new Handler(Looper.getMainLooper()).post(() -> updateAllWidgets(context, STATE_STANDBY));
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

                byte[] connack = new byte[4];
                int read = in.read(connack);
                if (read < 4 || connack[3] != 0) return false;

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

# 2. Modern Glassmorphism Card & Circular Glowing Orb Drawables
write_clean(
    "android/app/src/main/res/drawable/widget_bg.xml",
    """
    <?xml version="1.0" encoding="utf-8"?>
    <shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
        <gradient
            android:angle="135"
            android:startColor="#131C31"
            android:centerColor="#0B1121"
            android:endColor="#050914"
            android:type="linear" />
        <corners android:radius="26dp" />
        <stroke android:width="1.5dp" android:color="#3338BDF8" />
    </shape>
    """,
)

write_clean(
    "android/app/src/main/res/drawable/widget_pill_bg.xml",
    """
    <?xml version="1.0" encoding="utf-8"?>
    <shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
        <solid android:color="#1AFFFFFF" />
        <corners android:radius="999dp" />
        <stroke android:width="1dp" android:color="#22FFFFFF" />
    </shape>
    """,
)

write_clean(
    "android/app/src/main/res/drawable/widget_orb_ring_blue.xml",
    """
    <?xml version="1.0" encoding="utf-8"?>
    <shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="oval">
        <solid android:color="#1F2563EB" />
        <stroke
            android:width="1.5dp"
            android:color="#6638BDF8"
            android:dashWidth="6dp"
            android:dashGap="4dp" />
    </shape>
    """,
)

write_clean(
    "android/app/src/main/res/drawable/widget_orb_ring_green.xml",
    """
    <?xml version="1.0" encoding="utf-8"?>
    <shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="oval">
        <solid android:color="#2E10B981" />
        <stroke
            android:width="2dp"
            android:color="#9934D399" />
    </shape>
    """,
)

write_clean(
    "android/app/src/main/res/drawable/widget_orb_btn_blue.xml",
    """
    <?xml version="1.0" encoding="utf-8"?>
    <shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="oval">
        <gradient
            android:angle="315"
            android:startColor="#3B82F6"
            android:centerColor="#1D4ED8"
            android:endColor="#0F172A"
            android:type="linear" />
        <stroke android:width="2.5dp" android:color="#4DFFFFFF" />
    </shape>
    """,
)

write_clean(
    "android/app/src/main/res/drawable/widget_orb_btn_green.xml",
    """
    <?xml version="1.0" encoding="utf-8"?>
    <shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="oval">
        <gradient
            android:angle="315"
            android:startColor="#34D399"
            android:centerColor="#059669"
            android:endColor="#064E3B"
            android:type="linear" />
        <stroke android:width="2.5dp" android:color="#80A7F3D0" />
    </shape>
    """,
)

write_clean(
    "android/app/src/main/res/drawable/ic_widget_key.xml",
    """
    <?xml version="1.0" encoding="utf-8"?>
    <vector xmlns:android="http://schemas.android.com/apk/res/android"
        android:width="28dp"
        android:height="28dp"
        android:viewportWidth="24"
        android:viewportHeight="24">
        <path
            android:fillColor="#FFFFFF"
            android:pathData="M12.65,10C11.83,7.67 9.61,6 7,6c-3.31,0 -6,2.69 -6,6s2.69,6 6,6c2.61,0 4.83,-1.67 5.65,-4H17v4h4v-4h2v-4H12.65zM7,14c-1.1,0 -2,-0.9 -2,-2s0.9,-2 2,-2s2,0.9 2,2S8.1,14 7,14z" />
    </vector>
    """,
)

write_clean(
    "android/app/src/main/res/drawable/ic_widget_unlock.xml",
    """
    <?xml version="1.0" encoding="utf-8"?>
    <vector xmlns:android="http://schemas.android.com/apk/res/android"
        android:width="28dp"
        android:height="28dp"
        android:viewportWidth="24"
        android:viewportHeight="24">
        <path
            android:fillColor="#FFFFFF"
            android:pathData="M12,17c1.1,0 2,-0.9 2,-2s-0.9,-2 -2,-2s-2,0.9 -2,2S10.9,17 12,17zM18,8h-1V6c0,-2.76 -2.24,-5 -5,-5S7,3.24 7,6h2c0,-1.66 1.34,-3 3,-3s3,1.34 3,3v2H6c-1.1,0 -2,0.9 -2,2v10c0,1.1 0.9,2 2,2h12c1.1,0 2,-0.9 2,-2V10C20,8.9 19.1,8 18,8z" />
    </vector>
    """,
)

# 3. Modern Circular Orb Layout (door_widget.xml)
write_clean(
    "android/app/src/main/res/layout/door_widget.xml",
    """
    <?xml version="1.0" encoding="utf-8"?>
    <LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
        android:id="@+id/widget_root_card"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:background="@drawable/widget_bg"
        android:gravity="center"
        android:orientation="vertical"
        android:padding="12dp">

        <!-- Header Tag Pill -->
        <TextView
            android:id="@+id/tv_widget_title"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:background="@drawable/widget_pill_bg"
            android:paddingLeft="10dp"
            android:paddingTop="3dp"
            android:paddingRight="10dp"
            android:paddingBottom="3dp"
            android:text="SMARTLAB-GEO"
            android:textColor="#CBD5E1"
            android:textSize="9sp"
            android:textStyle="bold"
            android:letterSpacing="0.08" />

        <!-- Center Circular Glowing Orb Button (Persis seperti Tombol Dashboard) -->
        <FrameLayout
            android:id="@+id/orb_click_container"
            android:layout_width="118dp"
            android:layout_height="118dp"
            android:layout_marginTop="8dp"
            android:layout_marginBottom="6dp">

            <!-- Outer Dashed Glow Ring -->
            <ImageView
                android:id="@+id/img_orb_ring"
                android:layout_width="match_parent"
                android:layout_height="match_parent"
                android:src="@drawable/widget_orb_ring_blue" />

            <!-- Inner Circular Gradient Button -->
            <ImageView
                android:id="@+id/img_orb_core"
                android:layout_width="98dp"
                android:layout_height="98dp"
                android:layout_gravity="center"
                android:src="@drawable/widget_orb_btn_blue" />

            <!-- Icon & Text Inside Circular Orb -->
            <LinearLayout
                android:layout_width="98dp"
                android:layout_height="98dp"
                android:layout_gravity="center"
                android:gravity="center"
                android:orientation="vertical"
                android:padding="6dp">

                <ImageView
                    android:id="@+id/img_orb_icon"
                    android:layout_width="26dp"
                    android:layout_height="26dp"
                    android:src="@drawable/ic_widget_key" />

                <TextView
                    android:id="@+id/tv_orb_action"
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:layout_marginTop="3dp"
                    android:text="BUKA PINTU"
                    android:textColor="#FFFFFF"
                    android:textSize="10sp"
                    android:textStyle="bold"
                    android:letterSpacing="0.04" />

                <TextView
                    android:id="@+id/tv_orb_sub"
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:text="Sentuh"
                    android:textColor="#BFDBFE"
                    android:textSize="8sp" />
            </LinearLayout>
        </FrameLayout>

        <!-- Bottom Status Indicator -->
        <TextView
            android:id="@+id/tv_widget_state"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="● SIAP BUKA"
            android:textColor="#34D399"
            android:textSize="10sp"
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
        android:minHeight="140dp"
        android:resizeMode="horizontal|vertical"
        android:updatePeriodMillis="1800000"
        android:widgetCategory="home_screen" />
    """,
)

# 4. Patch AndroidManifest.xml
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

print("Successfully injected circular orb DoorWidgetProvider and patched AndroidManifest.xml")
