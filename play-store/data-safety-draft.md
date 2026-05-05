# Google Play Data Safety Draft

Use this as a Play Console input guide. Confirm the final answers against the exact production build and server behavior before submission.

## App Data Collection

Does the app collect or share any required user data types?

Recommended answer: Yes, if PDF conversion is enabled with a server.

Reason: The app can upload user-selected HWP/HWPX documents to a document conversion API. Google Play classifies user files and documents as user data when they leave the device.

If the production release has no hosted conversion server and only opens files locally, this can be changed to no collection for files. Do not choose that unless the production app never transmits documents off-device.

## Data Types

Files and docs:

- Collected: Yes, only when the user opens or shares a document that requires conversion.
- Shared: No, unless the conversion server is operated by a separate legal entity. If a third-party server/provider is used, review this answer.
- Purpose: App functionality.
- Optional or required: Required for PDF conversion; not required for local HWPX rendering.
- Processed ephemerally: Yes, if the conversion server deletes uploads and temporary outputs promptly.

App info and performance:

- Collected: No, unless crash reporting or analytics SDKs are added later.

Device or other IDs:

- Collected: No, unless analytics, ads, or push SDKs are added later.

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

## Policy Notes Before Submission

- Do not add analytics, ads, crash reporting, push notifications, login, or cloud storage without updating this file, the privacy policy, and Play Console answers.
- If a production conversion server is deployed, add server-side retention cleanup and document the retention period.
- If conversion is disabled in production, update the store description so users know which formats are supported locally.
