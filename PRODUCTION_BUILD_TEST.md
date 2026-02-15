# Production Build Testing

To test auth flow without Expo dev reload interference:

## iOS Production Build
```bash
expo run:ios --configuration Release
```

## Android Production Build  
```bash
expo run:android --variant Release
```

## Alternative: Disable Fast Refresh
In Expo dev menu (shake device):
1. Open dev menu
2. Disable "Fast Refresh" 
3. Disable "Live Reload"

## What to Expect
- Auth will initialize once
- No "Reloading apps" messages
- Index will see `isAuthReady=true` 
- Proper role-based redirect to `/doctor/dashboard`

## Debug Notes
- This issue only occurs in development
- Production builds work correctly
- Fast Refresh resets app state before auth completes
