# App Review response draft — Letters à deux, iOS 1.0

**Do not send until the updated build is deployed and the physical-device recording is attached.** Replace the recording placeholder only after capturing it on an iPhone running the latest iOS version. Demo credentials are maintained in App Store Connect and are intentionally not copied into this file.

Hello App Review,

Thank you for the additional review guidance. Please find the requested information below.

1. **Screen recording:** [Attach a recording captured on a physical iPhone. It starts by launching the app and demonstrates sign-in, the main couple-space flow, sending and receiving a letter, reporting and blocking, and account deletion.]

2. **Purpose and audience:** Letters à deux is a private correspondence app for two people who want to exchange longer letters and share small relationship activities. It gives them a calm, private space for letters, photos, a shared list, prompts, and a map of places they choose to save. It is intended for personal use and does not serve a regulated industry.

3. **Setup and access:** Sign in with the Apple Review demo credentials entered in App Store Connect under Sign-In Information. From the home screen, open the sample shared space to review letters and the app's features. Account deletion is available in Settings, under My Account. The demo space and credentials must remain active during review.

4. **External services:** Supabase provides authentication, database, and photo storage. Sign in with Apple and Google are optional authentication providers. Cloudflare Workers and Resend process and send email notifications. Anthropic Claude is called through the app's service only when a user requests an AI summary; selected letter text is sent for that request. Nominatim, Carto, and ipapi.co support city suggestions and maps. Spotify provides embeds for links that users add. Apple Push Notification service is used when push notifications are enabled. Google Fonts and jsDelivr/CDNJS serve fonts and frontend libraries.

5. **Regional availability:** The core correspondence and shared-space features are consistent across regions. Optional third-party sign-in, maps, Spotify embeds, AI summaries, and notifications depend on provider availability in a region and on the user's settings.

6. **Regulated services and third-party material:** Letters à deux does not operate in a regulated industry. Photos and letters are supplied by users. Spotify content is embedded from Spotify when users add a track; the app does not include licensed third-party media files.

Best regards,
Letters à deux
