# Personal Wireless Use

This build is configured for personal use on the same Wi-Fi network.

Current PC Wi-Fi address:

`192.168.45.13`

The Android app uses this conversion API by default:

`http://192.168.45.13:3000`

## How to Use Without USB

1. Connect the PC and phone to the same Wi-Fi network.
2. Start the conversion server on the PC:

   ```powershell
   npm run server
   ```

3. Allow Node.js through Windows Firewall if Windows asks.
4. Install the release APK on the phone once.
5. Open or share an HWP/HWPX file to HwpViewer.

The phone no longer needs `adb reverse` or a USB cable for document conversion.

## If Wi-Fi IP Changes

Run this on the PC:

```powershell
ipconfig
```

Find the `Wireless LAN adapter Wi-Fi` IPv4 address, then update:

`src/utils/pdfConverter.ts`

Change:

```ts
const PERSONAL_LAN_API_BASE_URL = 'http://192.168.45.13:3000';
```

to the new IP address, rebuild the APK, and reinstall it.

## Important

This is not a Google Play production configuration. It allows HTTP access to a private LAN server for personal use.
