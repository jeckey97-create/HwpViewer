# Google Play Data Safety Draft

Use this as a Play Console input guide. Confirm the final answers against the exact production build and server behavior before submission.

## App Data Collection

Does the app collect or share any required user data types?

Recommended answer: Yes, if PDF conversion is enabled with a server or ads are enabled.

Reason: The app can upload user-selected HWP/HWPX documents to a document conversion API. Google Play classifies user files and documents as user data when they leave the device. If an advertising SDK is added, it may also collect/share advertising-related data.

If the production release has no hosted conversion server and only opens files locally, this can be changed to no collection for files. Do not choose that unless the production app never transmits documents off-device.

## Data Types

Files and docs:

- Collected: Yes, only when the user opens or shares a document that requires conversion.
- Shared: No, unless the conversion server is operated by a separate legal entity. If a third-party server/provider is used, review this answer.
- Purpose: App functionality.
- Optional or required: Required for PDF conversion; not required for local HWPX rendering.
- Processed ephemerally: Yes, if the conversion server deletes uploads and temporary outputs promptly.

App activity:

- Collected: Yes, if using Google Mobile Ads SDK or another ad SDK that collects app interactions.
- Shared: Yes, if the advertising SDK provider receives this data.
- Purpose: Advertising or marketing, analytics, fraud prevention/security/compliance.

Device or other IDs:

- Collected: Yes, if using an advertising SDK with device/account identifiers or Advertising ID.
- Shared: Yes, if the advertising SDK provider receives this data.
- Purpose: Advertising or marketing, analytics, fraud prevention/security/compliance.

App info and performance:

- Collected: Yes, if the advertising SDK collects diagnostics such as crash logs, performance data, or other diagnostic information.
- Shared: Yes, if the advertising SDK provider receives this data.
- Purpose: Analytics, fraud prevention/security/compliance, app functionality.

Personal info:

- Collected: No.

Location:

- Collected: No.

Photos and videos:

- Collected: No.

Audio:

- Collected: No.

Contacts:

- Collected: No.

Calendar:

- Collected: No.

Messages:

- Collected: No.

Financial info:

- Collected: No.

Health and fitness:

- Collected: No.

Web browsing:

- Collected: No.

## Security Practices

Data encrypted in transit:

- Recommended answer: Yes, for release builds, because document conversion must use HTTPS.
- Note: Debug builds can use local HTTP for development only and should not be submitted as production behavior.

Users can request data deletion:

- Recommended answer: Yes only if you provide a contact route and operate a conversion server with deletion capability.
- Recommended answer: No if the app has no account system and all server processing is strictly ephemeral. Play Console wording can vary, so choose based on the final form.

Independent security review:

- No, unless a formal review has been completed.

## Ads Declaration

Play Console App content > Ads:

- Recommended answer: Yes.
- Reason: A top banner ad is still an ad. Google Play shows a "Contains ads" label when banner ads or third-party ad SDK ads are included.

## Advertising ID

If Google Mobile Ads SDK or another SDK uses the Android Advertising ID:

- Declare Advertising ID usage in Play Console if prompted.
- Confirm the SDK adds or requires `com.google.android.gms.permission.AD_ID`.
- If you intentionally do not use Advertising ID, configure the SDK/manifest accordingly and verify the final merged manifest.

## Target Audience / Families

Recommended target audience:

- Avoid targeting children unless the app is specifically designed for children and all ad requirements are implemented.
- If children or users of unknown age are in the target audience, use only appropriate self-certified ad SDKs and avoid interest-based advertising for those users.

## Policy Notes Before Submission

- Do not add analytics, crash reporting, push notifications, login, or cloud storage without updating this file, the privacy policy, and Play Console answers.
- When the actual ad SDK is selected, update this draft using that SDK provider's official Play Data Safety disclosure.
- If a production conversion server is deployed, add server-side retention cleanup and document the retention period.
- If conversion is disabled in production, update the store description so users know which formats are supported locally.
