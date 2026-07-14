# 📤 How to Export from Figma Make

Quick guide to export your RedMark app from Figma Make for deployment.

---

## 🔍 Look for Export Button

In Figma Make interface, look for one of these:

- **"Export"** button (usually top-right)
- **"Download"** button
- **"Share"** menu → "Download code"
- **File menu** → "Export project"

---

## 📦 What Gets Exported

When you export, you should get:

**Format**: Usually a `.zip` file

**Contents**:

```
redmark-app.zip
├── src/              ← All your app code
├── public/           ← Icons and static files
├── package.json      ← Dependencies
├── vite.config.ts    ← Build config
├── vercel.json       ← Deployment config
└── other files
```

---

## ✅ After Export

1. **Unzip the file** to a folder on your computer
2. **Verify files** - make sure you have:
   - `src` folder
   - `public` folder with icons
   - `package.json`
   - `vite.config.ts`
   - `vercel.json`

3. **Ready for GitHub!** → Follow DEPLOYMENT.md Step 2

---

## 🆘 Can't Find Export Button?

### Alternative Methods:

#### Method 1: Browser DevTools (Advanced)

1. Right-click on Figma Make page
2. "Inspect" → "Sources" tab
3. Find your files in file tree
4. Copy manually (tedious!)

#### Method 2: Copy All Files

Since you're in a web environment:

1. Select all code from each file
2. Create files locally on your computer
3. Paste content into matching file names
4. Not ideal, but works!

#### Method 3: Figma Support

- Check Figma Make documentation
- Look for "Export" help article
- Contact Figma support if needed

---

## 📋 Files to Copy Manually (if needed)

If you need to copy files manually, here's the complete list:

### Core Files (Required)

1. `/src/app/App.tsx`
2. `/src/app/routes.tsx`
3. `/src/main.tsx`
4. `/src/index.css`
5. `/src/styles/theme.css`
6. `/src/styles/fonts.css`
7. `/package.json`
8. `/vite.config.ts`
9. `/vercel.json`
10. `/.gitignore`

### Components (All in /src/app/components/)

1. `Layout.tsx`
2. `BottomNav.tsx`
3. `Header.tsx`
4. `ProjectCard.tsx`
5. `VisitCard.tsx`
6. `PhotoCard.tsx`
7. `TagBadge.tsx`
8. `StatCard.tsx`
9. `FilterTabs.tsx`
10. `OfflineIndicator.tsx`
11. `PWAInstallPrompt.tsx`
12. `PWAUpdateNotification.tsx`
13. ... (and any other components you created)

### Pages (All in /src/app/pages/)

1. `LoginPage.tsx`
2. `DashboardPage.tsx`
3. `ProjectsPage.tsx`
4. `ProjectDetailPage.tsx`
5. `VisitDetailPage.tsx`
6. `NewVisitPage.tsx`
7. `PhotoGalleryPage.tsx`
8. `ReportsPage.tsx`
9. `TeamPage.tsx`
10. `NotFoundPage.tsx`

### Static Files (/public/)

1. `icon.svg`
2. `favicon.svg`

### Documentation (Optional)

1. `README.md`
2. `DEPLOYMENT.md`
3. `CHECKLIST.md`
4. `EXPORT-GUIDE.md` (this file)

---

## 💡 Pro Tips

### Keep File Structure

When copying manually, maintain the exact folder structure:

```
redmark-app/
├── src/
│   ├── app/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── App.tsx
│   │   └── routes.tsx
│   ├── styles/
│   └── main.tsx
├── public/
└── config files
```

### Use a Code Editor

- VS Code (free)
- Sublime Text
- Any text editor works

### Create Folders First

1. Create main `redmark-app` folder
2. Create `src`, `public` subfolders
3. Create nested folders as needed
4. Then paste file contents

---

## ✅ Verification

After exporting (or copying), verify:

- [ ] Total file count: 30+ files
- [ ] `package.json` exists and has dependencies
- [ ] `src/app/App.tsx` exists
- [ ] `public/icon.svg` exists
- [ ] `vite.config.ts` exists
- [ ] `vercel.json` exists

**If yes to all → Ready to upload to GitHub!** 🎉

---

## 🔗 Next Steps

After successful export:

1. ✅ Files exported/copied
2. → **Go to DEPLOYMENT.md Step 2** (Upload to GitHub)
3. → Deploy to Vercel
4. → Test PWA!

---

**Need help?** Check DEPLOYMENT.md for full guide!
