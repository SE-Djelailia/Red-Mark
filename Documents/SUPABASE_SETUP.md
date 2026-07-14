# 🚀 Instructions de Migration vers Supabase

## 📋 Vue d'ensemble

Cette migration permet à RedMark de passer de localStorage (stockage local) à Supabase (base de données cloud), offrant :

- ✅ **Données sécurisées** dans le cloud
- ✅ **Synchronisation** entre appareils
- ✅ **Collaboration** en temps réel
- ✅ **Backups automatiques**
- ✅ **Pas de risque de perte de données**

---

## 🛠️ Étape 1 : Configuration Supabase (Dashboard)

### 1.1 Créer le projet Supabase

Ton projet Supabase existe déjà avec les identifiants suivants :

- **Project ID**: `kcaxzgomyzuvsghnzufo`
- **URL**: `https://kcaxzgomyzuvsghnzufo.supabase.co`

### 1.2 Exécuter le schéma SQL

1. Va sur **https://supabase.com/dashboard/project/kcaxzgomyzuvsghnzufo**
2. Clique sur **"SQL Editor"** dans le menu de gauche
3. Clique sur **"+ New Query"**
4. Copie **tout le contenu** du fichier `/supabase-schema.sql`
5. Colle-le dans l'éditeur SQL
6. Clique sur **"Run"** (ou appuie sur Ctrl+Enter)
7. Attends que toutes les tables soient créées (tu verras "Success" en vert)

**✅ Vérifie que ces tables ont été créées :**

- `profiles`
- `projects`
- `project_members`
- `site_visits`
- `photos`
- `issues`
- `comments`
- `notifications`

### 1.3 Configurer le Storage (Photos)

1. Dans le dashboard Supabase, clique sur **"Storage"** dans le menu
2. Clique sur **"Create a new bucket"**
3. Nom du bucket : `project-photos`
4. Choisis **"Private"** (non public)
5. Clique sur **"Create bucket"**

**Configurer les politiques de sécurité :**

1. Clique sur le bucket `project-photos`
2. Va dans l'onglet **"Policies"**
3. Clique sur **"New policy"**

**Politique 1 : Upload (INSERT)**

```sql
CREATE POLICY "Users can upload their own photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'project-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

**Politique 2 : View (SELECT)**

```sql
CREATE POLICY "Users can view their own photos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'project-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

**Politique 3 : Delete (DELETE)**

```sql
CREATE POLICY "Users can delete their own photos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'project-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

---

## 🔐 Étape 2 : Configuration de l'Authentification

### 2.1 Configurer l'email (Optionnel mais recommandé)

1. Dans le dashboard, va dans **"Authentication" → "Providers"**
2. Clique sur **"Email"**
3. Active **"Enable Email provider"**
4. Active **"Confirm email"** (recommandé pour production)

### 2.2 Configuration des URLs (Important !)

1. Va dans **"Authentication" → "URL Configuration"**
2. **Site URL** : Ajoute ton URL de production (ex: `https://ton-app.vercel.app`)
3. **Redirect URLs** : Ajoute :
   - `http://localhost:5173`
   - `https://ton-app.vercel.app`

---

## 💾 Étape 3 : Migration des Données

Une fois que tu as configuré Supabase :

1. **Rafraîchis l'application** (F5)
2. **Crée un nouveau compte** ou **connecte-toi** avec Supabase
3. Un **popup de migration** apparaîtra automatiquement
4. Clique sur **"Migrer mes données"**
5. Attends que la migration se termine (peut prendre 1-2 minutes)
6. ✅ **Toutes tes données seront transférées vers Supabase !**

**Note :** Si tu avais déjà des projets/photos dans localStorage, ils seront automatiquement copiés vers Supabase.

---

## 🧪 Étape 4 : Vérification

### Vérifier que tout fonctionne :

1. **Ouvre la console du navigateur** (F12)
2. Tu devrais voir des logs comme :

   ```
   ✅ User created: votre@email.com
   🔄 Migrating X projects to Supabase...
   ✅ Project migrated: Nom du projet
   ✅ Migration to Supabase completed!
   ```

3. **Vérifie dans Supabase Dashboard** :
   - Va dans **"Table Editor"**
   - Clique sur **"projects"** → Tu devrais voir tes projets
   - Clique sur **"photos"** → Tu devrais voir tes photos
   - Va dans **"Storage" → "project-photos"** → Tu devrais voir les fichiers uploadés

---

## 🔄 Étape 5 : Test Multi-Appareils

Pour vérifier que la synchronisation fonctionne :

1. **Sur ton ordinateur** : Crée un nouveau projet
2. **Sur ton téléphone** (ou autre navigateur) : Connecte-toi avec le même compte
3. ✅ Le projet devrait apparaître automatiquement !

---

## 🛡️ Sécurité et Permissions (RLS)

Les **Row Level Security (RLS)** policies sont déjà configurées dans le schéma SQL :

- ✅ Chaque utilisateur ne voit **que ses propres données**
- ✅ Les membres d'un projet peuvent voir les données du projet
- ✅ Impossible d'accéder aux données d'autres utilisateurs
- ✅ Protection contre les accès non autorisés

---

## 📊 Suivi de l'Utilisation (Plan Gratuit)

Le plan gratuit de Supabase inclut :

- ✅ **500 MB** de base de données
- ✅ **1 GB** de stockage fichiers
- ✅ **50 000** requêtes par mois
- ✅ **2 GB** de bande passante

**Pour monitorer ton utilisation :**

1. Va dans **"Settings" → "Billing"**
2. Tu verras ton usage actuel en temps réel

---

## 🐛 Dépannage

### Problème : "Invalid API key"

- ✅ Vérifie que les variables d'environnement sont correctes dans `/utils/supabase/info.tsx`

### Problème : "Row Level Security policy violation"

- ✅ Vérifie que les RLS policies sont bien créées (voir étape 1.2)
- ✅ Exécute à nouveau le script `/supabase-schema.sql`

### Problème : "Storage bucket not found"

- ✅ Crée le bucket `project-photos` (voir étape 1.3)
- ✅ Vérifie que les policies de storage sont créées

### Problème : Migration ne démarre pas

- ✅ Ouvre la console (F12) et cherche les erreurs
- ✅ Vérifie que tu es bien connecté
- ✅ Essaie de réinitialiser le flag de migration :
  ```javascript
  // Dans la console du navigateur
  localStorage.removeItem("migration_completed_VOTRE_USER_ID");
  ```

---

## 📞 Support

Si tu rencontres des problèmes :

1. **Console du navigateur** (F12) : Cherche les erreurs en rouge
2. **Supabase Logs** : Va dans "Logs" → "API Logs" pour voir les requêtes
3. **Documentation Supabase** : https://supabase.com/docs

---

## ✅ Checklist de Migration

- [ ] Créer/vérifier le projet Supabase
- [ ] Exécuter le schéma SQL (`/supabase-schema.sql`)
- [ ] Créer le bucket `project-photos`
- [ ] Configurer les policies de Storage
- [ ] Configurer l'authentification
- [ ] Tester la création de compte
- [ ] Migrer les données existantes
- [ ] Vérifier que les projets apparaissent
- [ ] Vérifier que les photos s'uploadent
- [ ] Tester la synchronisation multi-appareils

---

## 🎉 Félicitations !

Une fois toutes ces étapes complétées, RedMark utilisera Supabase comme backend !

**Avantages immédiats :**

- 🔒 Données sécurisées dans le cloud
- 🌍 Accessibles de n'importe où
- 👥 Collaboration possible
- 💾 Backups automatiques
- 📱 Synchronisation entre appareils

**Prêt pour le pilote chez Jodoin Lamarre Pratte ! 🚀**
