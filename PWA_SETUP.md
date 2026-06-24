# 📱 RedMark PWA Setup Guide

## ✅ What's Installed

Your RedMark app is now a **Progressive Web App (PWA)** with the following features:

### 🎯 Core Features
- ✅ **Installable** - Can be installed on mobile/desktop like a native app
- ✅ **Offline Support** - Works without internet connection
- ✅ **Auto-Updates** - Automatically updates to new versions
- ✅ **Cache Strategy** - Smart caching for images and API calls
- ✅ **Background Sync** - Syncs data when connection returns
- ✅ **Push Notifications** - Ready for notifications (requires backend)

---

## 🚀 How to Install RedMark on Your Device

### 📱 On Mobile (iOS/Android)

#### **Android (Chrome/Edge)**
1. Open RedMark in Chrome or Edge
2. Wait for the install prompt to appear (~30 seconds)
3. Tap "Install" button
4. Or tap the menu (⋮) → "Add to Home Screen"
5. RedMark icon appears on home screen!

#### **iOS (Safari)**
1. Open RedMark in Safari
2. Tap the Share button (box with arrow)
3. Scroll down and tap "Add to Home Screen"
4. Tap "Add"
5. RedMark icon appears on home screen!

### 💻 On Desktop (Chrome/Edge)

1. Open RedMark in Chrome or Edge
2. Look for install icon in address bar
3. Click "Install RedMark"
4. Or go to menu → "Install RedMark"
5. App appears in your applications!

---

## 🎨 Creating App Icons

### Quick Setup (Auto-Generated Icons)

1. Open `/public/icons/icon-generator.html` in your browser
2. Click "Download All Icons"
3. Save all PNG files to `/public/icons/` folder
4. Done! Icons are ready to use

### Custom Icons (Recommended for Production)

Create PNG icons in these sizes:
- `icon-72x72.png`
- `icon-96x96.png`
- `icon-128x128.png`
- `icon-144x144.png`
- `icon-152x152.png`
- `icon-192x192.png`
- `icon-384x384.png`
- `icon-512x512.png`

**Design Guidelines:**
- Use RedMark red (#E10600) as primary color
- Include "R" letter or RedMark logo
- Make it recognizable at small sizes
- Use high contrast
- Avoid text smaller than icon size / 10

---

## 🔧 Configuration Files

### `/vite.config.ts`
Main PWA configuration with:
- Manifest settings
- Cache strategies
- Icon definitions
- Auto-update settings

### `/public/manifest.json`
App manifest with:
- App name and description
- Theme colors
- Display mode
- App shortcuts
- Categories

### `/public/service-worker.js`
Custom service worker for:
- Offline caching
- Background sync
- Push notifications
- Update management

---

## 🌐 Offline Capabilities

### What Works Offline?
✅ View projects  
✅ View site visits  
✅ Browse photos  
✅ Read comments  
✅ View issues  
✅ Navigate between pages  
✅ View cached data  

### What Requires Internet?
❌ Upload new photos  
❌ Create new visits  
❌ Submit comments  
❌ Real-time sync  
❌ Generate reports  

**Note:** Actions requiring internet will be queued and synced when connection returns (background sync).

---

## 📊 Cache Strategy

### 1. **App Shell** (Cache First)
- HTML, CSS, JavaScript
- Fonts, icons
- Cached on install
- Updated on new version

### 2. **Unsplash Images** (Cache First)
- 100 images max
- 30 days expiration
- Reduces data usage on construction sites

### 3. **API Calls** (Network First)
- 10 second timeout
- Fallback to cache
- 5 minute expiration
- 50 entries max

### 4. **User Photos** (Network First)
- Always try network first
- Cache for offline viewing
- Sync when online

---

## 🔔 Push Notifications (Future)

The PWA is ready for push notifications. To enable:

1. **Backend Setup Required:**
   - Generate VAPID keys
   - Set up push service
   - Store subscriptions

2. **User Permission:**
   - Request notification permission
   - Subscribe user to push service

3. **Send Notifications:**
   - New comments
   - Issue assignments
   - Visit reminders
   - Weather alerts

---

## 🎯 App Shortcuts

Long-press the RedMark icon on mobile to access quick actions:

1. **Nouvelle visite** → Create new site visit
2. **Mes projets** → View all projects
3. **Tableau de bord** → Open dashboard

---

## 🧪 Testing PWA Features

### Test Install Prompt
1. Open DevTools → Application → Manifest
2. Click "Add to home screen" to test
3. Or wait 30 seconds on first visit

### Test Offline Mode
1. Open DevTools → Network tab
2. Select "Offline" from throttling dropdown
3. Navigate the app - should still work!
4. Create actions - they'll sync when online

### Test Updates
1. Make a code change
2. Build the app
3. Open the app
4. See update notification
5. Click "Update" to reload with new version

### Test Service Worker
1. Open DevTools → Application → Service Workers
2. See registered service worker
3. Test "Update on reload"
4. Test "Offline" checkbox

---

## 📈 Performance Benefits

### Before PWA
- ❌ Requires internet always
- ❌ Slow on poor connections
- ❌ Re-downloads assets every time
- ❌ No app icon on home screen
- ❌ Browser UI visible

### After PWA
- ✅ Works offline on construction sites
- ✅ Instant loading (cached assets)
- ✅ Saves bandwidth (cached images)
- ✅ Native app experience
- ✅ Full-screen mode
- ✅ Professional appearance

---

## 🛠️ Troubleshooting

### Install Prompt Not Showing?
- Clear browser cache
- Delete PWA if already installed
- Wait 30 seconds on page
- Check console for errors
- Try different browser

### Offline Mode Not Working?
- Check Service Worker registration
- Clear cache and hard reload
- Check browser DevTools → Application
- Verify cache strategy in config

### Icons Not Displaying?
- Ensure icons exist in `/public/icons/`
- Check manifest.json paths
- Clear browser cache
- Verify icon sizes are correct

### Updates Not Installing?
- Hard reload (Ctrl+Shift+R)
- Unregister service worker
- Clear all site data
- Reinstall the app

---

## 🚀 Deployment Checklist

Before deploying to production:

- [ ] Generate custom app icons
- [ ] Test install on iOS Safari
- [ ] Test install on Android Chrome
- [ ] Test offline functionality
- [ ] Test on slow 3G connection
- [ ] Verify manifest.json details
- [ ] Test app shortcuts work
- [ ] Check update notification
- [ ] Verify cache sizes are appropriate
- [ ] Test background sync (when online)
- [ ] Add HTTPS (required for PWA)
- [ ] Test on actual construction site!

---

## 📚 Additional Resources

- [PWA Builder](https://www.pwabuilder.com/) - Test your PWA
- [Lighthouse](https://developers.google.com/web/tools/lighthouse) - Audit PWA
- [Workbox](https://developers.google.com/web/tools/workbox) - Service Worker library
- [Web.dev PWA Guide](https://web.dev/progressive-web-apps/) - Best practices

---

## 🎉 You're All Set!

RedMark is now a fully functional Progressive Web App ready for construction site use!

**Next Steps:**
1. Generate app icons (see above)
2. Test installation on mobile device
3. Test offline mode on construction site
4. Train team on installation process
5. Deploy to production with HTTPS

**Need Help?**
Check the troubleshooting section or contact support.

---

**Made with ❤️ for Jodoin Lamarre Pratte architectes**
