# ✅ RedMark Deployment Checklist

Quick checklist to ensure successful deployment to Vercel.

---

## 📁 Before You Export from Figma Make

- [ ] App is working correctly in preview
- [ ] All features tested (login, projects, photos, tags, reports)
- [ ] Mobile responsiveness verified
- [ ] French text is correct throughout

---

## 📦 Files to Export

Make sure these files are included when you export:

### Required Files

- [ ] `/src` folder (entire folder with all subfolders)
- [ ] `/public` folder with:
  - [ ] `icon.svg`
  - [ ] `favicon.svg`
- [ ] `package.json`
- [ ] `vite.config.ts`
- [ ] `vercel.json`
- [ ] `.gitignore`

### Optional (but recommended)

- [ ] `README.md`
- [ ] `DEPLOYMENT.md`
- [ ] `CHECKLIST.md` (this file)

---

## 🔍 Pre-Deployment Verification

### Check vite.config.ts

- [ ] VitePWA plugin is configured
- [ ] Manifest has correct app name: "RedMark"
- [ ] Theme color is set: `#E10600`
- [ ] Icons reference `/icon.svg`
- [ ] Service worker enabled with `devOptions.enabled: true`

### Check vercel.json

- [ ] Build command: `npm run build`
- [ ] Output directory: `dist`
- [ ] Rewrites configured for SPA routing
- [ ] Service worker headers configured

### Check package.json

- [ ] Name: `redmark-app`
- [ ] Scripts include: `build`, `dev`, `preview`
- [ ] All dependencies present (especially `vite-plugin-pwa`)

### Check /public folder

- [ ] `icon.svg` exists and is valid SVG
- [ ] `favicon.svg` exists and is valid SVG
- [ ] Both icons have red (#E10600) and black (#1A1A1A) colors

---

## 📤 GitHub Upload Checklist

- [ ] Created new repository on GitHub
- [ ] Repository name: `redmark-app` (or your choice)
- [ ] Visibility set (private or public)
- [ ] All files uploaded successfully
- [ ] No upload errors in GitHub

### Files you should see on GitHub:

```
redmark-app/
├── src/
│   ├── app/
│   └── styles/
├── public/
│   ├── icon.svg
│   └── favicon.svg
├── package.json
├── vite.config.ts
├── vercel.json
├── .gitignore
└── README.md
```

---

## 🚀 Vercel Deployment Checklist

### Import Phase

- [ ] Connected GitHub to Vercel
- [ ] Found `redmark-app` repository
- [ ] Clicked "Import"

### Configuration Phase

- [ ] Framework preset: Vite ✅
- [ ] Build command: `npm run build` ✅
- [ ] Output directory: `dist` ✅
- [ ] Root directory: `.` ✅
- [ ] No environment variables needed ✅

### Deployment Phase

- [ ] Clicked "Deploy"
- [ ] Build started successfully
- [ ] Build completed (no errors)
- [ ] Got success message with URL
- [ ] Copied deployment URL

---

## 🧪 Post-Deployment Testing

### Basic Functionality

- [ ] App loads on Vercel URL
- [ ] Login page appears
- [ ] Can login with demo credentials
- [ ] Dashboard shows projects
- [ ] Can navigate between pages
- [ ] Photos load correctly
- [ ] Tagging system works
- [ ] Reports can be generated

### PWA Testing - Desktop Chrome

- [ ] Open Vercel URL in Chrome
- [ ] Wait 5 seconds
- [ ] Install icon appears in address bar OR
- [ ] Install prompt appears automatically
- [ ] Click "Install"
- [ ] App opens in standalone window
- [ ] No browser UI visible (no address bar)
- [ ] App icon appears in taskbar/dock

### PWA Testing - Mobile

#### iOS Safari

- [ ] Open Vercel URL in Safari
- [ ] Tap Share button
- [ ] "Add to Home Screen" option available
- [ ] Tap "Add"
- [ ] Icon appears on home screen
- [ ] Tap icon - opens in fullscreen
- [ ] Status bar color is correct

#### Android Chrome

- [ ] Open Vercel URL in Chrome
- [ ] Install prompt appears OR
- [ ] Menu has "Install app" option
- [ ] Tap "Install"
- [ ] Icon appears in app drawer
- [ ] Opens like native app

### Offline Testing

- [ ] Open installed app while online
- [ ] Turn on Airplane Mode
- [ ] Close app completely
- [ ] Reopen app
- [ ] App loads and works offline ✅
- [ ] Photos are cached
- [ ] Navigation works
- [ ] Turn off Airplane Mode
- [ ] Changes sync when back online

### Chrome DevTools Verification

- [ ] Open DevTools (F12)
- [ ] Go to Application tab
- [ ] **Manifest**: Shows RedMark info ✅
- [ ] **Service Worker**: Shows "activated and running" ✅
- [ ] **Cache Storage**: Has cached files ✅
- [ ] No console errors

### Lighthouse Audit

- [ ] Run Lighthouse in DevTools
- [ ] PWA score: 90+ ✅
- [ ] Performance score: 70+ ✅
- [ ] Accessibility score: 80+ ✅
- [ ] Best Practices score: 80+ ✅

---

## 🎯 Success Criteria

Your deployment is successful if:

✅ App loads on Vercel URL  
✅ PWA install works on desktop  
✅ PWA install works on mobile  
✅ Offline mode works  
✅ Service worker is active  
✅ Manifest is detected  
✅ No console errors  
✅ Lighthouse PWA score 90+

---

## 🐛 Common Issues & Fixes

### "Build failed"

- Check package.json has all dependencies
- Verify vite.config.ts syntax is correct
- Check build logs for specific error

### "404 on page refresh"

- Verify vercel.json has rewrites configured
- Check output directory is "dist"

### "Install button doesn't appear"

- Wait 5 seconds after page load
- Hard refresh (Ctrl+Shift+R)
- Check manifest in DevTools
- Verify service worker is registered

### "Offline doesn't work"

- Visit site while online first
- Check service worker is active
- Verify cache storage has files

---

## 📞 Getting Help

If you encounter issues:

1. **Check browser console** for error messages
2. **Check Vercel logs** in deployment details
3. **Review DEPLOYMENT.md** for detailed troubleshooting
4. **Check Vercel docs**: https://vercel.com/docs

---

## 🎉 You're Done!

Once all items are checked, your RedMark PWA is successfully deployed!

**Your live app**: `https://your-app.vercel.app`

Share it with:

- Jodoin Lamarre Pratte architectes team
- Other architecture firms for pilot testing
- Mobile users for field testing

---

**Last updated**: Feb 2026
