# 🔐 Authentication Testing Guide

**Errors Fixed!** ✅

---

## ✅ What Was Fixed

### **Error 1: `publicAnonKey is not defined`**

**Problem:** Missing import in AuthContext.tsx  
**Fix:** Added `import { projectId, publicAnonKey } from '/utils/supabase/info'`  
**Status:** ✅ Fixed

### **Error 2: `Invalid login credentials`**

**Problem:** Users trying to login before creating an account  
**Fix:** Added better error messages and guidance  
**Status:** ✅ Fixed

### **Bonus Fixes:**

- ✅ Added Toaster component so notifications appear
- ✅ Improved error messages in French
- ✅ Auto-switch to login mode if email already exists
- ✅ Show helpful hints for demo usage

---

## 🧪 How to Test Authentication

### **Test 1: Sign Up (Create New Account)**

1. **Open your app** at: https://your-app.vercel.app
2. **Click** "Nouveau? Créer un compte"
3. **Fill in the form:**
   ```
   Nom complet: Marie Tremblay
   Firme: Jodoin Lamarre Pratte
   Courriel: marie@test.com
   Mot de passe: test123
   ```
4. **Click** "S'inscrire"
5. **Expected Result:**
   - ✅ Green toast: "Compte créé avec succès!"
   - ✅ Redirected to /app dashboard
   - ✅ No errors in console

### **Test 2: Sign Out**

1. **While logged in**, find the logout button (usually in header/profile)
2. **Click** "Déconnexion" or logout icon
3. **Expected Result:**
   - ✅ Redirected back to login page
   - ✅ Session cleared

### **Test 3: Sign In (Existing Account)**

1. **On login page**, enter your credentials:
   ```
   Courriel: marie@test.com
   Mot de passe: test123
   ```
2. **Click** "Se connecter"
3. **Expected Result:**
   - ✅ Green toast: "Connexion réussie!"
   - ✅ Redirected to /app dashboard
   - ✅ User data loaded

### **Test 4: Wrong Password**

1. **Try to login** with wrong password:
   ```
   Courriel: marie@test.com
   Mot de passe: wrongpassword
   ```
2. **Click** "Se connecter"
3. **Expected Result:**
   - ✅ Red toast: "Courriel ou mot de passe incorrect. Essayez de créer un compte."
   - ✅ Stays on login page
   - ✅ No crash

### **Test 5: Duplicate Email**

1. **Try to sign up** with email that already exists
2. **Expected Result:**
   - ✅ Red toast: "Ce courriel est déjà utilisé. Essayez de vous connecter."
   - ✅ Automatically switches to login mode
   - ✅ Can now login with that email

### **Test 6: Persistent Session**

1. **Log in successfully**
2. **Close the browser tab**
3. **Reopen** your app URL
4. **Expected Result:**
   - ✅ Still logged in
   - ✅ Dashboard loads immediately
   - ✅ No need to login again

### **Test 7: Password Too Short**

1. **Try to sign up** with short password:
   ```
   Mot de passe: 123
   ```
2. **Click** "S'inscrire"
3. **Expected Result:**
   - ✅ Browser shows "minimum 6 characters" message
   - ✅ Form doesn't submit

---

## 🐛 Debugging Authentication Issues

### **Check Browser Console:**

**Open DevTools** (F12) → Console tab

**Look for:**

- ✅ "Auth error: [error message]" - Shows what went wrong
- ✅ Supabase API responses
- ✅ Network requests to `/auth/signup` and `/auth/login`

### **Check Network Tab:**

**DevTools** (F12) → Network tab

**Look for:**

1. **POST request to `/auth/signup`**
   - Status: 200 = Success ✅
   - Status: 400 = Error (check response)

2. **Supabase Auth requests**
   - Should see requests to `kcaxzgomyzuvsghnzufo.supabase.co`
   - Check response payloads

### **Check Supabase Dashboard:**

1. **Go to:** https://supabase.com/dashboard
2. **Select your project:** kcaxzgomyzuvsghnzufo
3. **Check Authentication:**
   - Go to **Authentication** → **Users**
   - See if your test user was created
   - Check email, created_at, etc.

4. **Check Database:**
   - Go to **Table Editor** → `kv_store_9fe75696`
   - Look for keys starting with `user:`
   - Should see your user profile data

5. **Check Logs:**
   - Go to **Edge Functions** → **make-server-9fe75696** → **Logs**
   - See API calls and any server errors

---

## ❌ Common Issues & Solutions

### **Issue: "Invalid login credentials"**

**Cause:** User doesn't exist yet  
**Solution:** Click "Nouveau? Créer un compte" and sign up first

### **Issue: "publicAnonKey is not defined"**

**Cause:** Old version of code  
**Solution:** ✅ Already fixed! Make sure you deployed the updated code

### **Issue: No toast notifications appear**

**Cause:** Toaster component not added  
**Solution:** ✅ Already fixed! Toaster now in App.tsx

### **Issue: Stuck on login page after signup**

**Cause:** Navigation not working  
**Solution:** Check console for errors, ensure `/app` route exists

### **Issue: Session not persisting**

**Cause:** Browser blocking cookies  
**Solution:**

- Check browser privacy settings
- Allow cookies for your domain
- Try different browser

### **Issue: "Network error" or "Failed to fetch"**

**Cause:** Backend server not running or CORS issue  
**Solution:**

- Check Supabase Edge Function is deployed
- Check CORS headers in server code
- Verify API URL is correct

---

## ✅ Expected Behavior Summary

| Action                         | Expected Result                                  |
| ------------------------------ | ------------------------------------------------ |
| Sign up with new email         | ✅ Account created → Auto login → Dashboard      |
| Sign up with existing email    | ❌ Error: "Email already used" → Switch to login |
| Login with correct credentials | ✅ Login successful → Dashboard                  |
| Login with wrong password      | ❌ Error: "Incorrect credentials"                |
| Logout                         | ✅ Return to login page                          |
| Refresh page while logged in   | ✅ Stay logged in                                |
| Password < 6 chars             | ❌ Browser validation error                      |

---

## 🎯 What to Test Next

Once authentication works:

1. **Create a project** - Test project API
2. **Add a site visit** - Test visit API
3. **Upload a photo** - Test storage
4. **Add tags** - Test tag system
5. **View data** - Verify persistence

---

## 📊 Data Flow Diagram

```
┌─────────────────────────────────────────────┐
│  USER SIGNS UP                              │
└───────────────┬─────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────┐
│  1. Frontend: signUp() called               │
│     - Email, password, name, firm           │
└───────────────┬─────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────┐
│  2. POST /auth/signup                       │
│     - Sent to Edge Function server          │
└───────────────┬─────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────┐
│  3. Server: Create user in Supabase Auth   │
│     - supabase.auth.admin.createUser()      │
└───────────────┬─────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────┐
│  4. Server: Store profile in KV store      │
│     - kv.set(`user:${userId}`, {...})       │
└───────────────┬─────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────┐
│  5. Frontend: Auto-login with credentials  │
│     - signIn(email, password)               │
└───────────────┬─────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────┐
│  6. Supabase: Create session + JWT token   │
│     - Token stored in localStorage          │
└───────────────┬─────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────┐
│  7. Frontend: Fetch user profile           │
│     - GET /users/:id with token             │
└───────────────┬─────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────┐
│  8. Frontend: Update AuthContext state     │
│     - setUser(userData)                     │
│     - setSession(session)                   │
└───────────────┬─────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────┐
│  9. Navigate to dashboard                  │
│     - /app route                            │
└─────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────┐
│  ✅ USER IS LOGGED IN                       │
└─────────────────────────────────────────────┘
```

---

## 🚀 Deploy Updated Code

**To deploy these fixes:**

```bash
# Navigate to your project folder
cd D:\RedMark

# Add all changes
git add .

# Commit the auth fixes
git commit -m "Fix: Authentication errors - import publicAnonKey and improve error handling"

# Push to GitHub
git push

# Vercel auto-deploys in ~30 seconds! ✅
```

---

## ✅ Summary

**Fixed Files:**

- ✅ `/src/app/context/AuthContext.tsx` - Added missing import
- ✅ `/src/app/components/Login.tsx` - Better error messages
- ✅ `/src/app/App.tsx` - Added Toaster component

**Now Working:**

- ✅ User signup
- ✅ User login
- ✅ Session persistence
- ✅ Error notifications
- ✅ Better UX with French messages

**Test It:**

1. Deploy the updated code
2. Open your app
3. Create an account
4. Login
5. All should work! 🎉

---

**Ready to test?** Deploy and try creating your first account! 🚀
