package com.hwpviewer

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    setIntent(normalizeSharedFileIntent(intent))
    super.onCreate(savedInstanceState)
  }

  override fun onNewIntent(intent: Intent) {
    val normalizedIntent = normalizeSharedFileIntent(intent)
    super.onNewIntent(normalizedIntent)
    setIntent(normalizedIntent)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "HwpViewer"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  private fun normalizeSharedFileIntent(sourceIntent: Intent?): Intent {
    if (sourceIntent == null) {
      return Intent()
    }

    val action = sourceIntent.action
    if (action != Intent.ACTION_SEND && action != Intent.ACTION_SEND_MULTIPLE) {
      return sourceIntent
    }

    val streamUri = getSharedStreamUri(sourceIntent) ?: return sourceIntent
    return Intent(sourceIntent).apply {
      setAction(Intent.ACTION_VIEW)
      data = streamUri
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
  }

  @Suppress("DEPRECATION")
  private fun getSharedStreamUri(sourceIntent: Intent): Uri? {
    val singleStream = sourceIntent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
    if (singleStream != null) {
      return singleStream
    }

    val multipleStreams =
        sourceIntent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
    return multipleStreams?.firstOrNull()
  }
}
