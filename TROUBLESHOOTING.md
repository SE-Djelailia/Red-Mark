# 🔧 Guide de dépannage RedMark

## ❓ Problème : "Je perds mes comptes à chaque fois"

### Causes possibles :

#### 1️⃣ **Navigation privée / Incognito**
- ❌ Le localStorage ne persiste PAS en mode navigation privée
- ✅ **Solution** : Utilisez un navigateur en mode normal

#### 2️⃣ **Paramètres du navigateur**
- ❌ Certains navigateurs effacent le localStorage à la fermeture
- ✅ **Solution** : Vérifiez les paramètres de confidentialité

**Chrome/Edge:**
- Paramètres → Confidentialité → Cookies → Décochez "Effacer les cookies à la fermeture"

**Firefox:**
- Paramètres → Vie privée → Historique → Choisir "Conserver l'historique"

**Safari:**
- Préférences → Confidentialité → Décochez "Bloquer tous les cookies"

#### 3️⃣ **Extensions de navigateur**
- ❌ Extensions de confidentialité (Privacy Badger, uBlock, etc.) peuvent bloquer localStorage
- ✅ **Solution** : Désactivez temporairement ou ajoutez une exception pour localhost

#### 4️⃣ **Navigateur en mode "Effacer à la fermeture"**
- ❌ Le navigateur efface automatiquement les données
- ✅ **Solution** : Changez les paramètres de nettoyage automatique

#### 5️⃣ **Quota de stockage dépassé**
- ❌ Le localStorage a une limite (généralement 5-10MB)
- ✅ **Solution** : Utilisez le bouton Debug (🐛) pour voir et nettoyer

#### 6️⃣ **Plusieurs onglets ouverts**
- ⚠️ Parfois, plusieurs onglets peuvent créer des conflits
- ✅ **Solution** : Fermez tous les onglets sauf un et rechargez

---

## 🐛 Outil de diagnostic intégré

Un bouton violet avec une icône de bug (🐛) apparaît en bas à gauche de l'application.

### Comment l'utiliser :

1. **Cliquez sur le bouton 🐛** en bas à gauche
2. **Vérifiez les informations :**
   - ✅ Session active ? Vous devriez voir votre email
   - 👥 Nombre d'utilisateurs stockés
   - 📁 Nombre de projets, visites, etc.
   - 🔑 Clés localStorage présentes

3. **Rafraîchir** : Cliquez sur l'icône de rafraîchissement pour mettre à jour
4. **Nettoyer** : Bouton rouge pour effacer toutes les données (⚠️ Irréversible!)

---

## ✅ Test rapide de persistance

### Étape 1 : Créer un compte
```
1. Allez sur la page d'accueil
2. Créez un compte avec :
   - Email : test@example.com
   - Mot de passe : test123
   - Nom : Test User
3. Notez si vous êtes connecté
```

### Étape 2 : Vérifier avec le Debug
```
1. Cliquez sur 🐛
2. Vérifiez :
   - Session : Doit afficher "✓ Connecté: test@example.com"
   - Utilisateurs : Doit afficher "1" ou plus
```

### Étape 3 : Test de persistance
```
1. Rafraîchissez la page (F5)
2. Cliquez sur 🐛
3. Vérifiez si la session est toujours là
```

### Étape 4 : Test de redémarrage
```
1. Fermez complètement le navigateur
2. Rouvrez-le et retournez sur l'app
3. Cliquez sur 🐛
4. Vérifiez si les données sont toujours là
```

---

## 🔍 Inspection manuelle du localStorage

### Dans la console du navigateur :

**Ouvrir la console :**
- Chrome/Edge : `F12` ou `Ctrl+Shift+I` (Windows) / `Cmd+Option+I` (Mac)
- Firefox : `F12`
- Safari : `Cmd+Option+C`

**Vérifier les données :**

```javascript
// Voir tous les utilisateurs
console.log(JSON.parse(localStorage.getItem('redmark_users')));

// Voir la session actuelle
console.log(JSON.parse(localStorage.getItem('redmark_session')));

// Voir tous les projets
console.log(JSON.parse(localStorage.getItem('redmark_projects')));

// Compter les clés RedMark
console.log(Object.keys(localStorage).filter(k => k.startsWith('redmark_')));
```

---

## 🚨 Solutions d'urgence

### Si rien ne fonctionne :

#### Option 1 : Nettoyer et recommencer
```javascript
// Dans la console du navigateur
localStorage.clear();
location.reload();
```

#### Option 2 : Vérifier les erreurs
```javascript
// Dans la console, recherchez les erreurs rouges
// Elles pourraient indiquer un problème avec le code
```

#### Option 3 : Utiliser un autre navigateur
- Essayez Chrome, Firefox ou Edge
- Assurez-vous d'être en mode normal (pas privé)

---

## 📊 Informations sur le stockage

### Données stockées par RedMark :

| Clé localStorage | Contenu | Taille approximative |
|-----------------|---------|---------------------|
| `redmark_users` | Comptes utilisateurs | ~1KB par utilisateur |
| `redmark_session` | Session active | ~0.5KB |
| `redmark_projects` | Liste des projets | ~2KB par projet |
| `redmark_visits` | Visites de chantier | ~1KB par visite |
| `redmark_photos` | Métadonnées photos | ~0.5KB par photo |
| `redmark_project_members` | Membres des projets | ~0.5KB par membre |
| `redmark_comments` | Commentaires | ~0.5KB par commentaire |
| `redmark_issues` | Déficiences | ~1KB par déficience |

**Total typique pour un projet actif :** 5-20 MB

---

## ⚙️ Configuration recommandée

### Pour développement local :

1. **Navigateur recommandé :** Chrome ou Firefox (version récente)
2. **Mode :** Navigation normale (PAS incognito)
3. **Extensions :** Désactiver les bloqueurs de stockage
4. **Paramètres :** Autoriser les cookies et le stockage local
5. **URL :** Toujours utiliser `localhost` (pas `127.0.0.1`)

---

## 🆘 Support

Si le problème persiste après avoir testé toutes ces solutions :

1. Cliquez sur 🐛 et prenez une capture d'écran
2. Ouvrez la console (F12) et copiez les erreurs rouges
3. Notez :
   - Navigateur et version
   - Système d'exploitation
   - Étapes pour reproduire le problème

---

**Dernière mise à jour :** 21 février 2026
