# PathWise Mobile App (React Native + Expo)

A premium, dark-mode AI learning platform mobile app built with Expo Router and Clerk auth.

---

## Prerequisites

- Node.js 18+
- Android Studio with an Android Emulator running (API 33+)
- PathWise Next.js frontend running locally on port 3000

---

## Setup & Run

### 1. Install dependencies
```bash
cd pathwise_app
npm install
```

### 2. Environment variables
The `.env` file is already configured:
```
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000/api
```
> `10.0.2.2` is Android Emulator's special IP for your PC's localhost.

### 3. Start the Next.js backend (in a separate terminal)
```bash
cd ../frontend
npm run dev
```
> The mobile app calls `/api/...` routes on the Next.js server.

### 4. Run on Android Emulator
```bash
npm run android
```

### 5. Run on iOS Simulator (macOS only)
```bash
npm run ios
```

### 6. Run with Expo Go (physical device)
```bash
npx expo start
```
Then scan the QR code with Expo Go app.
> For physical device, change `.env` `EXPO_PUBLIC_API_URL` to your PC's local IP:
> `http://192.168.x.x:3000/api`

---

## Features
- 🔐 Clerk Authentication (Sign In / Sign Up with email verification)
- 🗺️ AI Roadmap Generation via Gemini API
- ✅ Module completion tracking with progress saved to MongoDB
- ⚡ XP system (50 XP per completed module)
- 🔥 Streak counter
- 📊 Profile with stats grid
- 🎨 Premium dark glassmorphism UI

---

## Tech Stack
| Layer | Technology |
|---|---|
| Framework | Expo SDK 56 + Expo Router |
| Language | TypeScript |
| Auth | @clerk/clerk-expo |
| Animations | Moti + Reanimated v3 |
| State | Zustand + TanStack React Query |
| HTTP | Axios with Clerk JWT interceptor |
| Database | MongoDB (via Next.js API routes) |
