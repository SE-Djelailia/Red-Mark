# ⚡ Update Cheat Sheet - Quick Reference

**How to update your live app after making changes in Figma Make**

---

## 🎯 The 3-Step Update Process

```
1. Make changes in Figma Make ✏️
         ↓
2. Download & push to GitHub 📤
         ↓
3. Vercel auto-deploys ✨ (30 seconds)
```

---

## 📋 Commands You'll Use Every Time

```bash
# Navigate to project
cd path/to/redmark-app

# Add all changes
git add .

# Commit with message
git commit -m "Update: what you changed"

# Push to GitHub (triggers Vercel deploy)
git push
```

**That's it!** Your changes go live in ~30 seconds. ✨

---

## 🔄 Complete Workflow

### **1️⃣ Make Changes in Figma Make**

- Edit your files
- Test changes in preview
- ✅ Changes look good

---

### **2️⃣ Download Updated Files**

**Option A: Individual files** (for small changes)
- Copy updated file content from Figma Make
- Paste into local file

**Option B: Full export** (for major changes)
- Export entire project from Figma Make
- Extract ZIP and overwrite local files

---

### **3️⃣ Push to GitHub**

**Open Terminal/Command Prompt:**

```bash
cd redmark-app
git add .
git commit -m "Update: describe your changes"
git push
```

**Examples:**
```bash
git commit -m "Fix: Photo gallery sorting"
git commit -m "Add: Export to PDF feature"
git commit -m "Update: French translations"
git commit -m "Improve: Mobile menu navigation"
```

---

### **4️⃣ Vercel Auto-Deploys** ✨

**You don't do anything!**

- Vercel detects your GitHub push
- Builds your app automatically
- Deploys to production
- Takes 30 seconds - 3 minutes

---

### **5️⃣ Verify Changes**

**Open your live app:**
```
https://your-app.vercel.app
```

**Hard refresh to see changes:**
- **Windows**: `Ctrl + Shift + R`
- **Mac**: `Cmd + Shift + R`

---

## 🎯 Real Example - Start to Finish

**Scenario: You fixed a bug in PhotoGallery.tsx**

```bash
# 1. You made changes in Figma Make ✅
# 2. You downloaded the updated PhotoGallery.tsx ✅
# 3. Now push to GitHub:

cd redmark-app
git add src/app/components/PhotoGallery.tsx
git commit -m "Fix: Photo gallery sorting bug"
git push

# 4. Wait 30 seconds...
# 5. Open https://your-app.vercel.app
# 6. Press Ctrl+Shift+R (hard refresh)
# 7. Bug is fixed! ✅
```

**Total time: 2 minutes**

---

## 🛠️ Helpful Commands

```bash
# See what files changed
git status

# See the actual changes
git diff

# See recent commits
git log --oneline -5

# Add only specific files
git add src/app/App.tsx
git add src/styles/theme.css

# Commit and push in one line
git add . && git commit -m "Update: message" && git push
```

---

## 🐛 Common Issues & Fixes

### **"Changes not showing up"**
```
Solution: Hard refresh browser
Windows: Ctrl + Shift + R
Mac: Cmd + Shift + R
```

### **"Nothing to commit"**
```bash
# Make sure you're in the right folder
pwd     # Should show path ending in /redmark-app

# Make sure files actually changed
git status
```

### **"Deployment failed on Vercel"**
```
1. Go to vercel.com/dashboard
2. Click your project
3. Click the failed deployment (red)
4. View "Building" logs
5. Fix the error in Figma Make
6. Push again
```

---

## 📊 When to Update

| Situation | How Often | Time |
|-----------|-----------|------|
| **Bug fix** | Immediately | 1 min |
| **Small tweak** | Anytime | 1 min |
| **New feature** | When ready | 2 min |
| **Major update** | Weekly | 5 min |

**You can update as often as you want!** Every push deploys automatically.

---

## ✅ Quick Checklist

**Before pushing:**
- [ ] Changes tested in Figma Make
- [ ] Files downloaded to local computer
- [ ] In correct folder (`cd redmark-app`)

**Push commands:**
```bash
git add .
git commit -m "Update: clear description"
git push
```

**After pushing:**
- [ ] Check Vercel dashboard (optional)
- [ ] Wait 30-60 seconds
- [ ] Hard refresh live site
- [ ] Verify changes are live ✅

---

## 🎯 Copy-Paste Template

**Use this every time you update:**

```bash
# 1. Navigate to project
cd path/to/redmark-app

# 2. Check what changed
git status

# 3. Add, commit, push
git add .
git commit -m "Update: [DESCRIBE WHAT YOU CHANGED]"
git push

# 4. Done! Vercel will deploy in ~30 seconds
```

**Replace `[DESCRIBE WHAT YOU CHANGED]` with your actual changes.**

---

## 🔗 Need More Help?

**Full detailed guide:**  
→ **[UPDATE-WORKFLOW.md](./UPDATE-WORKFLOW.md)**

**Git setup guide:**  
→ **[GIT-COMMAND-GUIDE.md](./GIT-COMMAND-GUIDE.md)**

**Deployment troubleshooting:**  
→ **[DEPLOYMENT.md](./DEPLOYMENT.md)**

---

## 🎉 That's It!

**The update workflow is simple:**

```
Edit in Figma Make
      ↓
Download files
      ↓
git push
      ↓
Live in 30 seconds! ✨
```

**Bookmark this page** for quick reference! 🔖

---

**Happy coding!** 🚀
