# Play Upload Checklist

## Already Completed Locally

- Release AAB built successfully:
  `android/app/build/outputs/bundle/release/app-release.aab`
- Upload keystore created locally:
  `android/app/upload.keystore`
- Signing secrets stored locally:
  `android/local.properties`
- Keystore and local properties are ignored by git.
- Target SDK is API 36.
- Release manifest does not include broad storage permissions.
- Release manifest has `usesCleartextTraffic=false`.

## Before Uploading to Google Play

- Back up `android/app/upload.keystore` and `android/local.properties` securely.
- Confirm developer email for the store listing.
- Publish the privacy policy to a public URL.
- Confirm whether production PDF conversion is enabled.
- Confirm the ad SDK and top single-line banner ad unit ID.
- In Play Console App content > Ads, declare that the app contains ads.
- If the ad SDK uses Advertising ID, complete the Advertising ID declaration.
- Update Data Safety using the selected ad SDK provider's official disclosure.
- If conversion is enabled, use only an HTTPS conversion API.
- If conversion is enabled, define server retention and deletion behavior.
- Prepare screenshots from a real or representative Android device.
- Complete Play Console Data Safety using `data-safety-draft.md`.
- Complete content rating questionnaire.
- Choose target audience and ads declaration.
- Upload `app-release.aab` to internal or closed testing first.

## Current Risk To Resolve

The app's PDF conversion feature requires a configured HTTPS conversion API in release builds. If no production conversion server is available, users may only get local HWPX rendering/fallback behavior. Decide whether to:

1. Deploy and secure a production conversion server.
2. Disable or hide conversion-dependent behavior for the first Play release.
3. Clearly describe limited document support in the store listing.

The app is planned to include only a top single-line banner ad. Before uploading a build with ads:

1. Add the ad SDK and test ad unit first.
2. Verify the banner does not cover document controls or content.
3. Verify the Play Console "Contains ads" label is set to yes.
4. Verify the privacy policy and Data Safety answers include ad SDK data collection/sharing.
5. Verify there are no pop-up ads, app-open ads, rewarded ads, or full-screen interstitial ads.
