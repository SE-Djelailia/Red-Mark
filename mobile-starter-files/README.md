# RedMark Mobile - Starter Files

These are ready-to-use files for your iOS app. Once you've completed the setup in `IOS_APP_SETUP_GUIDE.md`, copy these files into your project.

## File Structure

After setup, your `redmark-mobile` folder should look like this:

```
redmark-mobile/
├── App.tsx                          ← Copy from this folder
├── app.json
├── package.json
├── lib/
│   └── supabase.ts                  ← Create this (instructions below)
└── screens/
    ├── AuthScreen.tsx               ← Copy from this folder
    ├── ProjectsListScreen.tsx       ← Copy from this folder
    └── ProjectDetailScreen.tsx      ← Copy from this folder
```

## Step-by-Step Installation

### 1. Create the `lib` folder

```bash
cd ~/Desktop/redmark-mobile
mkdir lib
```

### 2. Create `lib/supabase.ts`

Copy this content:

```typescript
import { createClient } from "@supabase/supabase-js";

// Get these from your Supabase dashboard
const supabaseUrl = "YOUR_SUPABASE_URL";
const supabaseAnonKey = "YOUR_SUPABASE_ANON_KEY";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

**Replace:**

- `YOUR_SUPABASE_URL` with your actual URL (e.g., `https://abc123.supabase.co`)
- `YOUR_SUPABASE_ANON_KEY` with your actual anon key

### 3. Create the `screens` folder

```bash
mkdir screens
```

### 4. Copy all files

**From this folder → To your project:**

1. **App.tsx**

   ```bash
   cp /path/to/mobile-starter-files/App.tsx ~/Desktop/redmark-mobile/App.tsx
   ```

2. **AuthScreen.tsx**

   ```bash
   cp /path/to/mobile-starter-files/screens/AuthScreen.tsx ~/Desktop/redmark-mobile/screens/AuthScreen.tsx
   ```

3. **ProjectsListScreen.tsx**

   ```bash
   cp /path/to/mobile-starter-files/screens/ProjectsListScreen.tsx ~/Desktop/redmark-mobile/screens/ProjectsListScreen.tsx
   ```

4. **ProjectDetailScreen.tsx**
   ```bash
   cp /path/to/mobile-starter-files/screens/ProjectDetailScreen.tsx ~/Desktop/redmark-mobile/screens/ProjectDetailScreen.tsx
   ```

### 5. Update AuthScreen.tsx

Open `screens/AuthScreen.tsx` and update line 47:

**Find:**

```typescript
`https://YOUR_PROJECT_ID.supabase.co/functions/v1/make-server-9fe75696/signup`,
```

**Replace with:**

```typescript
`https://YOUR_ACTUAL_PROJECT_ID.supabase.co/functions/v1/make-server-9fe75696/signup`,
```

And line 52:

```typescript
'Authorization': `Bearer YOUR_SUPABASE_ANON_KEY`,
```

Replace `YOUR_SUPABASE_ANON_KEY` with your actual key.

## Test Your App

### Start the development server:

```bash
cd ~/Desktop/redmark-mobile
npx expo start
```

### Press `i` to open iOS Simulator

You should see:

1. ✅ RedMark login screen
2. ✅ Can create account
3. ✅ Can login
4. ✅ See projects list (if you have projects in database)
5. ✅ Tap project to see details

## What Each File Does

### `App.tsx`

- Main entry point
- Handles authentication state
- Sets up navigation between screens
- Shows AuthScreen if not logged in, otherwise shows Projects

### `screens/AuthScreen.tsx`

- Login and signup screen
- Red RedMark branding
- Connects to Supabase authentication
- Validates email/password

### `screens/ProjectsListScreen.tsx`

- Shows all your projects from database
- Pull to refresh
- Tap project to view details
- Sign out button

### `screens/ProjectDetailScreen.tsx`

- Shows project information
- Lists all visits for the project
- Displays visit dates, weather, notes

## Current Features ✅

- ✅ User authentication (login/signup)
- ✅ View all projects
- ✅ View project details
- ✅ View visits for each project
- ✅ Pull to refresh
- ✅ Sign out

## Next Features to Add 🚧

Once this works, we'll add:

1. **Camera integration** - Take photos of the site
2. **Photo upload** - Save photos to Supabase
3. **Photo annotation** - Draw on photos
4. **Comments** - Add comments to visits
5. **Offline mode** - Work without internet
6. **Create new visits** - Add visits from mobile

## Troubleshooting

### "Cannot find module './lib/supabase'"

Make sure you created `lib/supabase.ts` with your credentials.

### "Failed to fetch" when signing up

1. Check your Supabase URL in AuthScreen.tsx (line 47)
2. Make sure your server is deployed and running
3. Verify the endpoint path is correct

### "Invalid login credentials"

1. Make sure you created an account first (use signup)
2. Check your email/password are correct
3. Verify Supabase is connected (check `lib/supabase.ts`)

### Projects list is empty

1. Check you have projects in your Supabase database
2. Pull down to refresh
3. Check console for errors: `npx expo start` → press `j` to open debugger

## Need Help?

After copying these files:

1. Run `npx expo start`
2. Press `i` for iOS simulator
3. Tell me what you see or any error messages
4. I'll help you fix any issues!

## What's Working vs What's Not Yet

### ✅ Working Now:

- Authentication
- Viewing existing data from database
- Navigation between screens
- Pull to refresh

### 🚧 Coming Soon:

- Taking photos with camera
- Uploading photos
- Drawing annotations
- Creating new visits
- Adding comments
- Offline sync

One step at a time! Let's get the basics working first.
