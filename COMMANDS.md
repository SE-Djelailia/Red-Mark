# 💻 RedMark - Command Reference

Quick reference for all deployment and development commands.

---

## 🏠 Local Development (Optional)

If you want to run RedMark locally before deploying:

### Prerequisites
```bash
# Check if Node.js is installed
node --version
# Should show: v18.x.x or higher

# Check if npm is installed
npm --version
# Should show: 9.x.x or higher
```

### Install Dependencies
```bash
# Navigate to project folder
cd redmark-app

# Install all packages
npm install
```

### Run Development Server
```bash
# Start dev server
npm run dev

# Server starts at:
# http://localhost:5173
```

### Build for Production
```bash
# Create production build
npm run build

# Output folder: dist/
```

### Preview Production Build
```bash
# Preview built app locally
npm run preview

# Serves from: dist/ folder
```

---

## 📤 Git Commands (For GitHub)

### First Time Setup
```bash
# Initialize git repository
git init

# Add all files
git add .

# Commit with message
git commit -m "Initial commit - RedMark PWA"

# Add GitHub remote
# (Replace YOUR_USERNAME and YOUR_REPO)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git

# Push to GitHub
git branch -M main
git push -u origin main
```

### Update Existing Repository
```bash
# Check status
git status

# Add changed files
git add .

# Commit changes
git commit -m "Update: description of changes"

# Push to GitHub
git push

# Vercel will auto-deploy!
```

---

## 🚀 Vercel Commands (CLI - Optional)

You can use Vercel CLI instead of web interface:

### Install Vercel CLI
```bash
npm install -g vercel
```

### Login to Vercel
```bash
vercel login
```

### Deploy
```bash
# First deployment
vercel

# Production deployment
vercel --prod
```

### Check Deployment Status
```bash
vercel ls
```

### View Logs
```bash
vercel logs YOUR_APP_URL
```

---

## 🔍 PWA Testing Commands

### Check Service Worker (Browser Console)
```javascript
// Check if service worker is registered
navigator.serviceWorker.getRegistrations()
  .then(registrations => console.log(registrations));

// Check if offline-capable
navigator.onLine; // true or false

// Get service worker status
navigator.serviceWorker.controller;
```

### Clear Cache (Browser Console)
```javascript
// Clear all caches
caches.keys()
  .then(names => {
    names.forEach(name => caches.delete(name));
  });

// Unregister service worker
navigator.serviceWorker.getRegistrations()
  .then(registrations => {
    registrations.forEach(registration => registration.unregister());
  });

// Then hard refresh: Ctrl+Shift+R
```

---

## 📊 Lighthouse Audit (Browser DevTools)

### Run Performance Audit
```bash
# In Chrome DevTools:
# 1. Press F12
# 2. Click "Lighthouse" tab
# 3. Check: Performance, PWA, Best Practices
# 4. Click "Analyze page load"
```

### Command Line Lighthouse
```bash
# Install Lighthouse
npm install -g lighthouse

# Run audit
lighthouse https://your-app.vercel.app --view

# Specific category
lighthouse https://your-app.vercel.app --only-categories=pwa --view
```

---

## 🐛 Debugging Commands

### Check Build Locally
```bash
# Build and check for errors
npm run build

# If successful, preview folder should exist:
ls dist/
```

### Check Dependencies
```bash
# List installed packages
npm list --depth=0

# Check for outdated packages
npm outdated

# Check for vulnerabilities
npm audit
```

### Verify Configuration Files
```bash
# Check if vercel.json exists
cat vercel.json

# Check if vite.config.ts exists
cat vite.config.ts

# Check if package.json is valid
npm pkg get name
```

---

## 🧹 Cleanup Commands

### Clear Node Modules
```bash
# Remove node_modules folder
rm -rf node_modules

# Remove package-lock.json
rm package-lock.json

# Reinstall
npm install
```

### Clear Build Cache
```bash
# Remove build outputs
rm -rf dist
rm -rf .vercel

# Remove Vite cache
rm -rf node_modules/.vite

# Rebuild
npm run build
```

---

## 📦 Package Management

### Add New Package
```bash
# Install package
npm install package-name

# Example: Add axios
npm install axios

# Install as dev dependency
npm install -D package-name
```

### Remove Package
```bash
npm uninstall package-name
```

### Update Package
```bash
# Update specific package
npm update package-name

# Update all packages
npm update
```

---

## 🔐 Environment Variables (If Needed)

### Create .env File
```bash
# Create environment file
touch .env

# Add variables (example)
echo "VITE_API_URL=https://api.example.com" >> .env
```

### Use in Code
```typescript
// Access in Vite
const apiUrl = import.meta.env.VITE_API_URL;
```

### Add to Vercel
```bash
# Via Vercel dashboard:
# Settings → Environment Variables → Add

# Or via CLI:
vercel env add VITE_API_URL
```

---

## 📱 Mobile Testing

### Test on Real Device

#### iOS (Safari)
```bash
# 1. Connect iPhone to Mac
# 2. Enable Web Inspector:
#    Settings → Safari → Advanced → Web Inspector
# 3. Open app on iPhone
# 4. On Mac: Safari → Develop → [Your iPhone] → [Page]
```

#### Android (Chrome)
```bash
# 1. Enable USB Debugging on Android
# 2. Connect to computer
# 3. Open Chrome DevTools
# 4. Click "..." → More tools → Remote devices
# 5. Select your device
```

---

## 🔄 Continuous Deployment

### Automatic Deploy on Git Push
```bash
# After initial Vercel setup, every git push triggers deploy:

git add .
git commit -m "Update feature X"
git push

# Vercel automatically:
# 1. Detects push
# 2. Builds app
# 3. Deploys to production
# 4. Updates live URL
```

### Preview Deployments
```bash
# Create feature branch
git checkout -b feature-name

# Make changes and push
git add .
git commit -m "Add feature"
git push origin feature-name

# Vercel creates preview URL automatically
# Check Vercel dashboard for preview link
```

---

## 📊 Analytics Commands

### Vercel Analytics
```bash
# Enable via dashboard:
# Project → Analytics → Enable

# Or via CLI:
vercel --prod --enable-analytics
```

---

## 🆘 Troubleshooting Commands

### Check if Port is in Use
```bash
# Check port 5173 (Vite default)
lsof -i :5173

# Kill process on port
kill -9 <PID>
```

### Check Node/npm Version
```bash
node --version
npm --version

# Update npm
npm install -g npm@latest
```

### Clear npm Cache
```bash
npm cache clean --force
```

### Reset Everything
```bash
# Nuclear option - start fresh
rm -rf node_modules package-lock.json dist .vercel
npm install
npm run build
```

---

## 📚 Useful Aliases

Add to your `.bashrc` or `.zshrc`:

```bash
# Quick aliases for RedMark
alias redmark-dev='npm run dev'
alias redmark-build='npm run build'
alias redmark-deploy='git add . && git commit && git push'

# PWA cache clear
alias clear-sw='rm -rf dist/.vite && npm run build'
```

---

## 🎯 Common Workflows

### Workflow 1: Make Changes & Deploy
```bash
# 1. Make your changes in code
# 2. Test locally
npm run dev

# 3. Build to check for errors
npm run build

# 4. Commit and push
git add .
git commit -m "Description of changes"
git push

# 5. Vercel auto-deploys!
```

### Workflow 2: Fix Bug
```bash
# 1. Create bug fix branch
git checkout -b fix-bug-name

# 2. Fix the bug

# 3. Test
npm run dev

# 4. Build
npm run build

# 5. Push for preview
git push origin fix-bug-name

# 6. Check preview URL in Vercel

# 7. Merge to main
git checkout main
git merge fix-bug-name
git push

# 8. Production deployment happens automatically
```

### Workflow 3: Emergency Rollback
```bash
# Via Vercel dashboard:
# 1. Go to Deployments
# 2. Find previous working deployment
# 3. Click "..." → Promote to Production

# Via CLI:
vercel rollback
```

---

## 📞 Getting Help

### Check Vercel Build Logs
```bash
# Via dashboard:
# Deployments → Click deployment → View logs

# Via CLI:
vercel logs
```

### Check Package Info
```bash
# Get package details
npm info package-name

# Get installed version
npm list package-name
```

---

## ✅ Quick Reference Table

| Task | Command |
|------|---------|
| **Install** | `npm install` |
| **Dev Server** | `npm run dev` |
| **Build** | `npm run build` |
| **Preview** | `npm run preview` |
| **Git Add** | `git add .` |
| **Git Commit** | `git commit -m "message"` |
| **Git Push** | `git push` |
| **Deploy** | Push to GitHub → Auto-deploy |
| **Check SW** | DevTools → Application → Service Workers |
| **Clear Cache** | DevTools → Application → Clear storage |
| **Hard Refresh** | `Ctrl + Shift + R` |
| **Lighthouse** | DevTools → Lighthouse → Analyze |

---

**Most Used Command**: `git push` → Triggers automatic deployment! 🚀

---

**Need more help?** Check DEPLOYMENT.md or TROUBLESHOOTING section in each guide.
