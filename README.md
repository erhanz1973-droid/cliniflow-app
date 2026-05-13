# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

## API_BASE (important)

Admin and Patient apps must always use the same backend per environment.

- Local development: set `EXPO_PUBLIC_API_URL` in `.env.local`
- Production: set `EXPO_PUBLIC_API_URL` in `.env.production`

If referrals do not appear in admin, check `EXPO_PUBLIC_API_URL` first.

## Native builds, EAS, and Xcode (production reliability)

- **Do not rely on Expo Go** for OAuth or push: use a **development build** (`eas build --profile development`) or **production** build. Push registration skips native work in Expo Go (`lib/registerExpoPush.ts`).
- **Local iOS pods:** React Native 0.81+ expects **Xcode ≥ 16.1**. Xcode 14.x may fail at `pod install` with an upgrade message. Prefer **EAS** for iOS binaries, or upgrade Xcode locally.
- **CocoaPods locale:** if `Unicode Normalization not appropriate for ASCII-8BIT`, run:  
  `export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` then `cd ios && pod install --repo-update`.
- **Full stabilization checklist** (OAuth, push, App Store, git safety): see  
  [`docs/PRODUCTION_STABILIZATION_REPORT.md`](./docs/PRODUCTION_STABILIZATION_REPORT.md).

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
