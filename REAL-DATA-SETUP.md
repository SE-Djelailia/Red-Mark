# 🚀 RedMark - Configuration Backend Réel

L'application RedMark est maintenant configurée pour utiliser de **vraies données** avec le backend Supabase!

## ✅ Ce qui a été activé

### **1. Backend complet Supabase**

- ✅ Authentification utilisateur
- ✅ Base de données KV pour stocker les données
- ✅ Stockage Supabase pour les photos
- ✅ API REST complète avec toutes les routes

### **2. Routes API disponibles**

#### **Authentification**

- `POST /auth/signup` - Créer un nouveau compte
- `GET /users/:id` - Obtenir le profil utilisateur

#### **Projets**

- `POST /projects` - Créer un projet
- `GET /projects` - Liste des projets de l'utilisateur
- `GET /projects/:id` - Détails d'un projet
- `PUT /projects/:id` - Modifier un projet
- `DELETE /projects/:id` - Supprimer un projet

#### **Visites de chantier**

- `POST /site-visits` - Créer une visite
- `GET /projects/:projectId/site-visits` - Visites d'un projet
- `GET /site-visits/:id` - Détails d'une visite

#### **Photos**

- `POST /photos` - Créer une photo (après upload Supabase Storage)
- `GET /site-visits/:visitId/photos` - Photos d'une visite
- `PUT /photos/:id` - Modifier une photo (tags, caption)
- `DELETE /photos/:id` - Supprimer une photo

#### **Tags**

- `POST /tags` - Créer un tag personnalisé
- `GET /tags` - Liste de tous les tags

### **3. Tags par défaut initialisés**

Au premier démarrage du serveur, 12 tags sont automatiquement créés:

**Issues (Problèmes)**

- Problème structurel
- Déficience électrique
- Plomberie
- Fissure
- Humidité

**Progress (Progrès)**

- Finitions
- Conforme
- Qualité excellente

**Inspection**

- À vérifier
- Urgent
- À corriger

**Safety (Sécurité)**

- Sécurité

---

## 🎯 Comment utiliser l'application

### **Étape 1: Créer un compte**

1. Ouvrir l'application
2. Sur la page de login, cliquer sur **"Créer un compte"** (si disponible) ou utiliser l'endpoint signup
3. Entrer vos informations:
   - Email
   - Mot de passe
   - Nom
   - Firme d'architecture

### **Étape 2: Se connecter**

1. Utiliser votre email et mot de passe
2. Le système vous authentifie avec Supabase Auth
3. Vous recevez un token d'accès valide

### **Étape 3: Créer votre premier projet**

1. Dans l'app, aller à **"Projets"**
2. Cliquer sur **"Nouveau projet"** (+)
3. Remplir:
   - Nom du projet
   - Adresse
   - Client
   - Date de début
   - Statut
4. **Enregistrer**

Le projet est sauvegardé dans la base de données Supabase KV!

### **Étape 4: Créer une visite de chantier**

1. Ouvrir le projet
2. Cliquer sur **"+"** pour nouvelle visite
3. Remplir:
   - Date de visite
   - Phase (Fondation, Charpente, ÉMÉ, Finitions, Extérieur)
   - Pièce / Zone
   - Notes
4. **Enregistrer**

La visite est créée et sauvegardée!

### **Étape 5: Ajouter des photos avec tags**

1. Ouvrir la visite créée
2. Cliquer sur **"+"** (Ajouter Photos)
3. Sélectionner une photo
4. Ajouter des tags:
   - Problème structurel
   - Urgent
   - etc.
5. Ajouter une caption (optionnel)
6. **Enregistrer**

La photo est uploadée sur Supabase Storage et enregistrée!

---

## 📊 Structure de données

### **KV Store Keys**

```
# Utilisateurs
user:{userId} → { id, email, name, firm, role, created_at }

# Projets
project:{projectId} → { id, name, address, client, status, start_date, owner_id, created_at, updated_at }
user_projects:{userId}:{projectId} → { role: 'owner' | 'viewer' | 'editor' }

# Visites
site_visit:{visitId} → { id, project_id, visit_date, phase, weather, temperature, attendees, notes, created_by, created_at }
project_visits:{projectId}:{visitId} → true

# Photos
photo:{photoId} → { id, site_visit_id, project_id, file_url, thumbnail_url, caption, tags[], location, taken_at, uploaded_by, created_at }
visit_photos:{visitId}:{photoId} → true
project_photos:{projectId}:{photoId} → true

# Tags
tag:{tagId} → { id, name, category, color, created_at }
```

---

## 🔧 Configuration requise

### **Variables d'environnement Supabase**

Ces variables sont déjà configurées dans votre environnement:

- ✅ `SUPABASE_URL`
- ✅ `SUPABASE_ANON_KEY`
- ✅ `SUPABASE_SERVICE_ROLE_KEY`
- ✅ `SUPABASE_DB_URL`

### **Storage Bucket**

Au premier démarrage, le bucket `redmark-photos` est automatiquement créé:

- Type: **Privé** (sécurisé)
- Limite: **50MB par fichier**
- Types acceptés: **JPEG, PNG, HEIC, WebP**

---

## 🔐 Sécurité

### **Authentification**

Toutes les routes API (sauf signup) requièrent un token JWT valide:

```javascript
Authorization: Bearer <access_token>
```

### **Autorisation**

- Les utilisateurs ne peuvent voir que **leurs propres projets**
- Les photos sont stockées dans un **bucket privé**
- Les URLs des photos sont **signées** (expiration après 1 an)

---

## 🐛 Débogage

### **Endpoints de debug disponibles**

1. **Tester l'auth token**

   ```
   GET /make-server-9fe75696/debug/test-auth
   Authorization: Bearer <token>
   ```

2. **Vérifier un utilisateur**

   ```
   GET /make-server-9fe75696/debug/users/:id
   ```

3. **Health check**
   ```
   GET /make-server-9fe75696/health
   ```

### **Console logs**

Le serveur log toutes les opérations:

- ✅ Authentification réussie
- ❌ Erreurs d'autorisation
- 📦 Opérations de base de données
- 🚀 Initialisation du serveur

---

## 📝 Notes importantes

### **Différences avec mode mock**

| Aspect            | Mode Mock             | Mode Réel              |
| ----------------- | --------------------- | ---------------------- |
| Données           | localStorage          | Supabase KV            |
| Photos            | Object URLs           | Supabase Storage       |
| Persistence       | Navigateur uniquement | Cloud (permanent)      |
| Multi-utilisateur | Non                   | Oui                    |
| Authentification  | Simulée               | Réelle (Supabase Auth) |

### **Limitations KV Store**

La table KV est flexible mais:

- ❌ Pas de requêtes SQL complexes
- ❌ Pas de joins entre tables
- ✅ Parfait pour le prototypage
- ✅ Performance excellente pour lecture/écriture simple

---

## 🚀 Prochaines étapes

1. **Créer votre compte** dans l'application
2. **Créer un premier projet** (ex: "CHUM - Centre Hospitalier")
3. **Créer une visite** pour ce projet
4. **Ajouter des photos** avec tags
5. **Générer un rapport PDF** de la visite

---

## ✨ Fonctionnalités actives

- ✅ **Authentification réelle** avec Supabase
- ✅ **Stockage cloud** permanent
- ✅ **Upload de photos** vers Supabase Storage
- ✅ **Système de tags** avec 12 tags par défaut
- ✅ **Multi-projets** par utilisateur
- ✅ **Visites de chantier** avec métadonnées
- ✅ **Collaboration** (infrastructure prête)
- ✅ **Génération de rapports PDF**

---

**L'application est maintenant 100% fonctionnelle avec de vraies données! 🎉**
