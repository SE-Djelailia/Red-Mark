# RedMark Mobile App - Architecture Overview

## How It All Works Together

```
┌─────────────────────────────────────────────────────┐
│                   YOUR iPHONE                       │
│                                                     │
│  ┌──────────────────────────────────────────┐     │
│  │         RedMark Mobile App               │     │
│  │                                          │     │
│  │  [Login Screen] ──────┐                 │     │
│  │                       │                 │     │
│  │  [Projects List] ◄────┴─── Auth Check  │     │
│  │       │                                 │     │
│  │       ├─► [Project Detail]             │     │
│  │       │         │                       │     │
│  │       │         ├─► [Visit Detail]     │     │
│  │       │         │         │             │     │
│  │       │         │         ├─► [Camera] │     │
│  │       │         │         │             │     │
│  │       │         │         └─► [Photos] │     │
│  │                                          │     │
│  └────────────────┬─────────────────────────┘     │
│                   │                               │
└───────────────────┼───────────────────────────────┘
                    │
                    │ Internet
                    │
         ┌──────────▼──────────┐
         │   SUPABASE CLOUD    │
         │                     │
         │  ┌──────────────┐  │
         │  │ Auth System  │  │  ← Login/Signup
         │  └──────────────┘  │
         │                     │
         │  ┌──────────────┐  │
         │  │  Database    │  │  ← Projects, Visits
         │  │  (Postgres)  │  │
         │  └──────────────┘  │
         │                     │
         │  ┌──────────────┐  │
         │  │   Storage    │  │  ← Photos
         │  │   (S3-like)  │  │
         │  └──────────────┘  │
         │                     │
         └─────────────────────┘
```

---

## Technology Stack

### Frontend (Mobile App)
- **React Native** - Build native iOS app with JavaScript
- **Expo** - Tools and services for React Native
- **TypeScript** - Type-safe JavaScript
- **React Navigation** - Navigate between screens

### Backend (Already Built!)
- **Supabase** - Your existing backend
  - Authentication (user login)
  - PostgreSQL database (projects, visits, photos)
  - File storage (photo uploads)
  - Real-time subscriptions (future feature)

### Development Tools
- **Xcode** - Apple's development environment
- **iOS Simulator** - Test app without iPhone
- **Expo Go** - Test on real iPhone
- **EAS Build** - Build production app

---

## App Flow (User Journey)

### 1️⃣ First Launch
```
User opens app
    ↓
No login session found
    ↓
Show Login Screen
    ↓
User enters email/password
    ↓
Supabase validates credentials
    ↓
Success: Store session
    ↓
Navigate to Projects List
```

### 2️⃣ View Projects
```
Projects List Screen loads
    ↓
Fetch projects from Supabase
    ↓
Display in scrollable list
    ↓
User taps a project
    ↓
Navigate to Project Detail
    ↓
Fetch visits for that project
    ↓
Display visits with dates
```

### 3️⃣ Take Photos (Coming Soon)
```
User taps "New Visit"
    ↓
Camera screen opens
    ↓
User takes photo
    ↓
Photo saved to device temporarily
    ↓
Upload to Supabase Storage
    ↓
Save photo record in database
    ↓
Display in visit detail
```

### 4️⃣ Annotate Photos (Coming Soon)
```
User taps photo
    ↓
Photo opens full screen
    ↓
Tap "Annotate"
    ↓
Drawing tools appear
    ↓
User draws on photo
    ↓
Save annotated version
    ↓
Upload to Supabase
    ↓
Replace original
```

---

## File Structure Explained

```
redmark-mobile/
│
├── App.tsx                          ← App entry point
│   • Checks if user is logged in
│   • Shows Auth or Projects screen
│   • Sets up navigation
│
├── app.json                         ← App configuration
│   • App name, version, icons
│   • iOS/Android settings
│   • Permissions (camera, photos)
│
├── package.json                     ← Dependencies
│   • Lists all npm packages
│   • Scripts to run app
│
├── lib/
│   └── supabase.ts                  ← Supabase connection
│       • Your database URL
│       • Your API key
│       • Creates Supabase client
│
└── screens/
    ├── AuthScreen.tsx               ← Login/Signup
    │   • Email/password inputs
    │   • Validation
    │   • Calls Supabase auth
    │
    ├── ProjectsListScreen.tsx       ← All projects
    │   • Fetches from database
    │   • Displays in list
    │   • Navigate to detail
    │
    ├── ProjectDetailScreen.tsx      ← One project
    │   • Shows project info
    │   • Lists all visits
    │   • Navigate to visit
    │
    ├── VisitDetailScreen.tsx        ← One visit (coming)
    │   • Shows visit info
    │   • Displays photos
    │   • Shows comments
    │
    └── CameraScreen.tsx             ← Take photos (coming)
        • Access camera
        • Capture photo
        • Upload to Supabase
```

---

## Data Flow

### Reading Data (GET)
```
1. User opens Projects List
2. Component calls: supabase.from('projects').select('*')
3. Supabase sends SQL query to PostgreSQL
4. Database returns rows
5. App displays in UI
```

### Writing Data (POST)
```
1. User creates new visit
2. Component calls: supabase.from('visits').insert({ ... })
3. Supabase validates user is authenticated
4. Database inserts new row
5. Returns new record
6. App updates UI
```

### Uploading Files
```
1. User takes photo with camera
2. Photo saved as blob in memory
3. Component calls: supabase.storage.from('photos').upload(...)
4. File uploaded to S3-compatible storage
5. Returns storage path
6. Save path in database record
```

---

## Component Lifecycle

### Screen Loads
```javascript
export default function ProjectsListScreen() {
  const [projects, setProjects] = useState([]);
  
  // 1. Component mounts
  useEffect(() => {
    loadProjects(); // 2. Fetch data
  }, []);
  
  const loadProjects = async () => {
    // 3. Query Supabase
    const { data } = await supabase
      .from('projects')
      .select('*');
    
    // 4. Update state
    setProjects(data);
    
    // 5. Re-render with data
  };
  
  // 6. Display UI
  return <FlatList data={projects} ... />
}
```

---

## Navigation Explained

### Stack Navigation
Think of it like a stack of cards:

```
[Project Detail] ← Top card (visible)
[Projects List]
[Auth Screen]   ← Bottom card
```

When you navigate:
- **Push** - Add new card on top
- **Pop** - Remove top card, reveal previous
- **Replace** - Swap top card

Code example:
```typescript
// Go to project detail (push)
navigation.navigate('ProjectDetail', { projectId: '123' });

// Go back (pop)
navigation.goBack();

// Replace current screen
navigation.replace('Projects');
```

---

## Authentication Flow

### Sign Up
```
1. User enters: email, password, name
2. App sends to: /signup endpoint
3. Server creates user in Supabase
4. Server auto-confirms email (since no email server)
5. Returns success
6. User can now sign in
```

### Sign In
```
1. User enters: email, password
2. App calls: supabase.auth.signInWithPassword()
3. Supabase validates credentials
4. Returns: session token + user data
5. Token stored automatically
6. App navigates to Projects
```

### Session Check
```
1. App launches
2. Check: supabase.auth.getSession()
3. If session exists: Go to Projects
4. If no session: Show Login
```

### Sign Out
```
1. User taps "Sign Out"
2. App calls: supabase.auth.signOut()
3. Session cleared
4. Navigate back to Login
```

---

## Styling in React Native

### Web vs Mobile
```javascript
// ❌ Web (doesn't work in React Native)
<div className="bg-red p-4 rounded">

// ✅ Mobile (React Native)
<View style={styles.container}>

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#E10600',
    padding: 16,
    borderRadius: 8,
  }
});
```

### No Tailwind
React Native doesn't support Tailwind CSS. Everything is styled with JavaScript objects.

---

## Differences from Web App

| Feature | Web App | Mobile App |
|---------|---------|------------|
| **Language** | HTML/CSS | React Native components |
| **Styling** | Tailwind classes | StyleSheet objects |
| **Navigation** | URLs/Links | Navigation stack |
| **Images** | `<img>` tag | `<Image>` component |
| **Clicks** | `onClick` | `onPress` |
| **Input** | `<input>` | `<TextInput>` |
| **Buttons** | `<button>` | `<TouchableOpacity>` |
| **Scrolling** | Automatic | `<ScrollView>` or `<FlatList>` |
| **Layout** | Flexbox | Flexbox (same!) |

---

## Why Expo?

### Without Expo:
```
1. Install Xcode command line tools
2. Install CocoaPods
3. Configure iOS project
4. Install Android Studio
5. Configure Android project
6. Set up signing certificates
7. Build native code
8. Debug platform-specific issues
❌ Takes days for beginners
```

### With Expo:
```
1. npm install -g expo-cli
2. npx create-expo-app
3. npx expo start
✅ Takes 5 minutes
```

Expo handles all the native configuration for you!

---

## Development Workflow

### Typical Day:
```
1. Open Terminal
2. cd ~/Desktop/redmark-mobile
3. npx expo start
4. Press 'i' for iOS simulator
5. Make code changes
6. See updates instantly (hot reload)
7. Test features
8. Repeat!
```

### Hot Reload
When you save a file, the app reloads instantly. No need to restart!

---

## Testing Strategy

### Phase 1: Simulator
- Free, fast, unlimited testing
- Good for UI and logic
- Can't test: camera, notifications

### Phase 2: Expo Go
- Test on real iPhone
- Scan QR code to load
- Good for all features
- Can't test: production behavior

### Phase 3: TestFlight
- Real production build
- Distributed via Apple
- Test before App Store
- Requires Developer account

---

## Build & Release Process

### Development Build (Now)
```bash
npx expo start
# Instant updates, hot reload
```

### Preview Build (Testing)
```bash
eas build --platform ios --profile preview
# Real app, but not on App Store
# Install via link
```

### Production Build (App Store)
```bash
eas build --platform ios --profile production
eas submit --platform ios
# Submits to App Store
# Apple reviews in 1-3 days
```

---

## Cost Breakdown

### Free:
- ✅ Expo account
- ✅ Development tools
- ✅ Simulator testing
- ✅ Expo Go testing
- ✅ 50 EAS builds/month
- ✅ Supabase free tier

### Paid:
- 💰 Apple Developer: $99/year (only for App Store)
- 💰 EAS Pro: $29/month (optional, for more builds)
- 💰 Supabase Pro: $25/month (optional, for more storage)

**You can develop for free indefinitely!**

---

## What You're Actually Building

Think of it like this:

1. **Current Web App** = Desktop/laptop version
2. **Mobile App** = Same data, different interface

They share:
- ✅ Same Supabase database
- ✅ Same user accounts
- ✅ Same projects and visits
- ✅ Same photos

They differ:
- 📱 Mobile has camera access
- 📱 Mobile works offline better
- 📱 Mobile has native feel
- 💻 Web is easier for bulk data entry

---

## Next Steps After Basic App Works

### Week 1: Core Features
- [ ] Camera integration
- [ ] Photo upload
- [ ] Photo display

### Week 2: Advanced Features
- [ ] Photo annotation
- [ ] Comments system
- [ ] Create visits

### Week 3: Polish
- [ ] App icon
- [ ] Splash screen
- [ ] Offline support
- [ ] Pull to refresh

### Week 4: Release
- [ ] TestFlight beta
- [ ] Fix bugs
- [ ] App Store submission
- [ ] Celebrate! 🎉

---

## Common Questions

### "Do I need to learn Swift?"
No! You're using React Native with JavaScript/TypeScript.

### "Will it work on Android too?"
Yes! With minor modifications, same code works on Android.

### "Can I reuse my web components?"
Not directly, but the logic is the same. Just change the UI parts.

### "What if I break something?"
Git lets you undo! Plus we test in simulator first.

### "How long to build?"
- Basic app: 1-2 weeks
- Full features: 1 month
- App Store approved: +1-3 days

---

## Resources

- **This guide** - Architecture overview (you are here!)
- **IOS_APP_SETUP_GUIDE.md** - Step-by-step setup
- **mobile-starter-files/** - Code to copy
- **MOBILE_APP_QUICK_START.md** - Quick reference

**Ready to build? Start with the setup guide!** 🚀
