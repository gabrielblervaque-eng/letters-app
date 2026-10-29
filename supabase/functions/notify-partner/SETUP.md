# Notifications iPhone (APNs)

The function sends push banners for a new letter and a shared mood. It only selects the other member of the authenticated user's space, and skips delivery if either member has blocked the other or the recipient has disabled notifications.

Before deploying this function, configure Push Notifications for the App ID `com.gabrielblervaque.letters` in the Apple Developer account and create an APNs authentication key. Add these values as Supabase Edge Function secrets; never commit the `.p8` private key:

- `APNS_KEY_ID`: Key ID shown by Apple
- `APNS_TEAM_ID`: Apple Developer Team ID (`3W32CLVQ9N` for this app)
- `APNS_PRIVATE_KEY`: full contents of the downloaded `.p8` file
- `APNS_BUNDLE_ID`: `com.gabrielblervaque.letters`
- `APNS_ENVIRONMENT`: `production` for TestFlight/App Store builds; use `sandbox` for a development-signed build

The iOS target also needs the Push Notifications capability enabled and a provisioning profile that includes the matching `aps-environment`. After that, create and distribute a new signed iOS build; the already-installed App Store/TestFlight build cannot gain this entitlement without an update.
