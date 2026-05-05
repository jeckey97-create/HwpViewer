# Work Continuation Notes

Branch: `security-before-play-upload`

Last completed steps:

- Hardened Android release security.
- Created local upload keystore and signed release AAB.
- Added Play Store privacy policy, Data Safety, store listing, and checklist drafts.
- Updated Play drafts for top single-line banner ads only. No pop-up ads, app-open ads, rewarded ads, or full-screen interstitial ads.

Current recommendation order:

1. Harden the document conversion server for production.
2. Deploy the conversion server behind HTTPS.
3. Configure the Android release app to use the HTTPS conversion API.
4. Add top single-line banner ads.
5. Rebuild release AAB.
6. Test on a real device.
7. Upload to Play Console internal or closed testing.

Current working item:

- Production hardening for `server/`. In progress: reduced sensitive logs, added security headers, rate limiting, static PDF no-store headers, viewer URL validation, and cleanup loop.

If work is interrupted, resume with:

`Continue from branch security-before-play-upload. Read play-store/work-continuation.md and continue the current working item.`
