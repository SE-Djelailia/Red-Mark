# 🔍 Guide de Débogage - Écran Blanc

## Étapes de débogage:

### 1️⃣ Ouvrez la Console du Navigateur

**Chrome/Edge**: F12 ou Cmd+Option+I (Mac)
**Firefox**: F12 ou Cmd+Option+K (Mac)

### 2️⃣ Allez dans l'onglet "Console"

Vous devriez voir des logs avec des emojis:

```
🔍 Checking session on mount: null
⚠️ No session found
```

### 3️⃣ Effacez le localStorage (nettoyage complet)

Dans la console, tapez:

```javascript
localStorage.clear();
```

Puis rafraîchissez la page (F5).

### 4️⃣ Créez un compte et surveillez les logs

Quand vous cliquez sur "S'inscrire", vous devriez voir:

```
🔐 SignUp called: { email: "...", name: "..." }
👤 New user created: { id: "...", email: "..." }
✅ Session created and user state updated
```

### 5️⃣ Après navigation vers /app

Vous devriez voir:

```
🔍 Checking session on mount: {"user":{...}, "created_at":"..."}
✅ Session found: { id: "...", email: "..." }
🏗️ ProjectList render - user: {...}, loading: false
📂 Loading projects for user: ...
```

---

## ❌ Si vous voyez des erreurs:

### Erreur: "useAuth must be used within an AuthProvider"

- Le AuthProvider n'est pas au bon endroit
- Vérifiez que `/src/app/routes.tsx` importe `SimpleAuthContext`

### Erreur: user is null après signup

- Le `setUser()` ne fonctionne pas
- Vérifiez les logs dans SimpleAuthContext

### Écran blanc sans logs

- Erreur de compilation React
- Vérifiez l'onglet "Console" pour les erreurs rouges
- Vérifiez l'onglet "Network" pour les 404

---

## 🧪 Test manuel du localStorage

Dans la console:

### Créer une fausse session:

```javascript
const fakeUser = {
  id: "test-123",
  email: "test@example.com",
  user_metadata: {
    name: "Test User",
    firm: "Test Firm",
    role: "architect",
  },
};

const fakeSession = {
  user: fakeUser,
  created_at: new Date().toISOString(),
};

localStorage.setItem("redmark_session", JSON.stringify(fakeSession));

// Puis rafraîchissez la page
location.reload();
```

Si ça fonctionne avec la fausse session, le problème est dans la fonction `signUp()`.

---

## 📋 Vérifications:

- [ ] Console ouverte (onglet Console visible)
- [ ] localStorage effacé
- [ ] Logs affichés lors du signup
- [ ] Session sauvegardée dans localStorage
- [ ] Navigation vers /app réussie
- [ ] ProjectList reçoit le user

---

## 🚨 Actions d'urgence:

### Option 1: Utilisez le test manuel

Copiez-collez dans la console:

```javascript
localStorage.clear();
const user = {
  id: crypto.randomUUID(),
  email: "demo@jlp.com",
  user_metadata: {
    name: "Demo User",
    firm: "JLP",
    role: "architect",
  },
};
localStorage.setItem(
  "redmark_session",
  JSON.stringify({ user, created_at: new Date().toISOString() }),
);
window.location.href = "/app";
```

### Option 2: Vérifiez l'URL

Êtes-vous sur `/app` ou `/` ?

- Si `/` : C'est normal de voir le login
- Si `/app` : Problème d'auth

---

## 📸 Envoyez-moi:

1. **Capture d'écran de la console** (avec les logs)
2. **L'URL actuelle** (dans la barre d'adresse)
3. **Ce que vous voyez** (texte exact de l'écran blanc)

Cela m'aidera à identifier le problème exact! 🔧
