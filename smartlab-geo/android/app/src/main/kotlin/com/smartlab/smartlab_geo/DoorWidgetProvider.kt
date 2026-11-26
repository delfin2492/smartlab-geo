package com.smartlab.smartlab_geo

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.SharedPreferences
import android.net.Uri
import android.widget.RemoteViews
import es.antonborri.home_widget.HomeWidgetBackgroundIntent
import es.antonborri.home_widget.HomeWidgetProvider

/**
 * Android Home Screen Widget Provider untuk SmartLab-GEO Door Exit.
 * Ketika tombol widget di layar utama HP ditekan, widget langsung
 * menjalankan background callback Flutter untuk mengirim MQTT payload "ON"
 * ke topic "smartlab-geo/door/exit/command" tanpa perlu membuka aplikasi.
 */
class DoorWidgetProvider : HomeWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
        widgetData: SharedPreferences
    ) {
        appWidgetIds.forEach { widgetId ->
            val views = RemoteViews(context.packageName, R.layout.door_widget).apply {
                val doorState = widgetData.getString("door_state", "SIAP BUKA") ?: "SIAP BUKA"
                val availState = widgetData.getString("device_avail", "Tap untuk buka") ?: "Tap untuk buka"

                setTextViewText(R.id.tv_widget_state, doorState)
                setTextViewText(R.id.tv_widget_sub, availState)

                // Saat tombol ditekan di Home Screen HP, panggil background URI smartlabgeo://opendoor
                val pendingIntent = HomeWidgetBackgroundIntent.getBroadcast(
                    context,
                    Uri.parse("smartlabgeo://opendoor")
                )
                setOnClickPendingIntent(R.id.btn_open_door_widget, pendingIntent)
            }
            appWidgetManager.updateAppWidget(widgetId, views)
        }
    }
}

