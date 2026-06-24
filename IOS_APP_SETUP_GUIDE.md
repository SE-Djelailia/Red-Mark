# RedMark iOS App - Complete Setup Guide

## What You'll Build
A native iOS app version of RedMark that works offline, uses your iPhone camera, and can be published to the App Store.

---

## PHASE 1: Prepare Your Mac (30 minutes)

### Step 1: Install Xcode
1. Open **App Store** on your Mac
2. Search for "Xcode"
3. Click **Get** (it's ~15GB, takes 30-60 min to download)
4. After install, open Xcode once and accept the license agreement
5. Close Xcode

### Step 2: Install Homebrew (if not already installed)
1. Open **Terminal** app on Mac
2. Paste this command and press Enter:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```
3. Follow the prompts (it may ask for your password)

### Step 3: Install Node.js
```bash
brew install node
```

### Step 4: Verify Installation
```bash
node --version    # Should show v18 or higher
npm --version     # Should show v9 or higher
```

---

## PHASE 2: Create Your Mobile App (20 minutes)

### Step 1: Create Expo Account
1. Go to https://expo.dev
2. Click **Sign Up**
3. Create free account (remember your username/password)

### Step 2: Install Expo CLI
Open Terminal and run:
```bash
npm install -g expo-cli eas-cli
```

### Step 3: Login to Expo
```bash
npx expo login
```
Enter your expo.dev username and password.

### Step 4: Create New App
```bash
# Navigate to where you want the project (e.g., Desktop)
cd ~/Desktop

# Create the app
npx create-expo-app redmark-mobile --template blank-typescript

# Go into the project
cd redmark-mobile
```

### Step 5: Install Required Packages
```bash
# Install navigation
npx expo install @react-navigation/native @react-navigation/stack
npx expo install react-native-screens react-native-safe-area-context

# Install camera and image picker
npx expo install expo-camera expo-image-picker expo-file-system

# Install Supabase
npm install @supabase/supabase-js

# Install UI components
npx expo install react-native-gesture-handler react-native-reanimated
```

---

## PHASE 3: Configure Your App (30 minutes)

### Step 1: Update app.json
Open `redmark-mobile/app.json` and replace everything with:

```json
{
  "expo": {
    "name": "RedMark",
    "slug": "redmark-mobile",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#E10600"
    },
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.yourname.redmark",
      "infoPlist": {
        "NSCameraUsageDescription": "RedMark needs camera access to take photos of construction sites.",
        "NSPhotoLibraryUsageDescription": "RedMark needs photo library access to save and view site photos."
      }
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#E10600"
      },
      "package": "com.yourname.redmark"
    },
    "plugins": [
      "expo-camera",
      "expo-image-picker",
      [
        "expo-build-properties",
        {
          "ios": {
            "deploymentTarget": "13.0"
          }
        }
      ]
    ]
  }
}
```

**Important**: Change `com.yourname.redmark` to use your own name (e.g., `com.john.redmark`)

### Step 2: Create Supabase Config File
Create file `redmark-mobile/lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

// REPLACE THESE with your actual Supabase credentials
const supabaseUrl = 'YOUR_SUPABASE_URL';
const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

**Where to find your Supabase credentials:**
1. Go to your Supabase project dashboard
2. Click **Settings** (gear icon)
3. Click **API**
4. Copy **Project URL** → paste as `supabaseUrl`
5. Copy **anon public** key → paste as `supabaseAnonKey`

---

## PHASE 4: Test on iOS Simulator (10 minutes)

### Step 1: Start the App
```bash
# Make sure you're in the redmark-mobile folder
cd ~/Desktop/redmark-mobile

# Start the dev server
npx expo start
```

### Step 2: Press `i` to open iOS Simulator
- The simulator will open automatically
- Your app will load
- You should see the default Expo screen

### Step 3: Test on Real iPhone (Optional)
1. Install **Expo Go** app from App Store on your iPhone
2. When you run `npx expo start`, a QR code appears
3. Open Camera app on iPhone and scan the QR code
4. App opens in Expo Go

---

## PHASE 5: Build Your First Screen (Next Steps)

Now that your environment is set up, we'll build the actual RedMark features:

### Priority Order:
1. ✅ **Authentication Screen** (login/signup) - START HERE
2. **Projects List Screen** (view all projects)
3. **Project Detail Screen** (view visits)
4. **Camera Screen** (take photos)
5. **Visit Detail Screen** (view photos, add comments)
6. **Photo Annotation Screen** (draw on photos)

---

## Common Issues & Fixes

### "Command not found: expo"
```bash
npm install -g expo-cli
```

### "Cannot find module @react-navigation"
```bash
npx expo install @react-navigation/native @react-navigation/stack
```

### "iOS Simulator not opening"
Make sure Xcode is installed and you've opened it at least once.

### "Supabase connection error"
Double-check your `supabaseUrl` and `supabaseAnonKey` in `lib/supabase.ts`

---

## What's Next?

Once you've completed PHASE 4 and can see your app running, come back and I'll help you:

1. **Build the authentication screen** (login/signup)
2. **Set up navigation** between screens
3. **Connect to your existing Supabase database**
4. **Implement camera functionality**
5. **Convert all your web features to mobile**

---

## Cost Breakdown

- **Xcode**: Free
- **Expo Account**: Free (for development)
- **Testing on Simulator**: Free
- **Testing on Real iPhone**: Free (with Expo Go)
- **Apple Developer Account**: $99/year (only needed to publish to App Store)
- **EAS Build Service**: Free tier available (50 builds/month)

You can develop and test completely free. You only pay when you're ready to publish.

---

## Questions?

After you complete each phase, let me know:
- ✅ "Phase 1 done" - I'll give you Phase 2 details
- ✅ "Phase 2 done" - I'll help you build the first screen
- ❌ "Phase X stuck" - Tell me the error message

Ready to start? Complete Phase 1 on your Mac, then tell me when you're done!
