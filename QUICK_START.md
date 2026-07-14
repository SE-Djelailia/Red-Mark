# ⚡ Quick Start - Migration Supabase

## 🎯 3 Étapes Pour Démarrer

### **Étape 1 : Créer les Tables (5 minutes)** 📊

1. **Ouvre le dashboard Supabase** :  
   👉 https://supabase.com/dashboard/project/kcaxzgomyzuvsghnzufo

2. **Clique sur "SQL Editor"** (menu gauche)

3. **Copie le fichier `/supabase-schema.sql`** et colle-le dans l'éditeur

4. **Clique "Run"** ▶️

5. **✅ Vérifie** : Va dans "Table Editor" → Tu devrais voir 9 tables

---

### **Étape 2 : Créer le Bucket Photos (2 minutes)** 📸

1. **Clique sur "Storage"** (menu gauche)

2. **"Create a new bucket"**
   - Nom : `project-photos`
   - Type : **Private** (coché)

3. **Clique sur le bucket** → **"Policies"** → **"New policy"**

4. **Politique 1** - Paste ce code :

```sql
CREATE POLICY "Users can upload photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'project-photos');
```

5. **Politique 2** - Paste ce code :

```sql
CREATE POLICY "Users can view photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'project-photos');
```

6. **Politique 3** - Paste ce code :

```sql
CREATE POLICY "Users can delete photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'project-photos');
```

---

### **Étape 3 : Tester l'App (1 minute)** 🧪

1. **Rafraîchis l'application** (F5)

2. **En bas à droite**, tu verras une boîte **"Supabase Health Check"**
   - ✅ Vert = Tout fonctionne !
   - ❌ Rouge = Il manque quelque chose (retour aux étapes précédentes)

3. **Crée un compte** ou **connecte-toi**

4. **Si tu avais des données** : Un popup "Migration" apparaîtra
   - Clique "Migrer mes données"
   - Attends 1-2 minutes
   - ✅ Terminé !

---

## 🎉 C'est Tout !

**RedMark utilise maintenant Supabase !**

✅ Tes données sont dans le cloud  
✅ Accessibles depuis n'importe quel appareil  
✅ Sauvegardées automatiquement  
✅ Protégées contre la perte

---

## 🐛 Problème ?

### ❌ Erreur "Invalid API key"

→ Les credentials Supabase sont déjà configurés, ce n'est pas ça

### ❌ Erreur "Row Level Security policy violation"

→ Tu as oublié d'exécuter le schéma SQL (Étape 1)

### ❌ Erreur "Bucket not found"

→ Tu n'as pas créé le bucket `project-photos` (Étape 2)

### ❌ Le Health Check est rouge

→ Lis le message d'erreur, il te dit exactement quoi faire

---

## 📚 Plus de Détails ?

- **Instructions complètes** : `/SUPABASE_SETUP.md`
- **Résumé technique** : `/MIGRATION_SUMMARY.md`

---

**Temps total : ~10 minutes** ⏱️  
**Difficulté : Facile** ✅  
**Support : Dashboard Supabase + Console navigateur** 🛠️
