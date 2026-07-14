# ✅ Correction du problème de dates

## 🐛 Problème identifié

Les dates affichées dans l'application étaient décalées d'un jour à cause de problèmes de **fuseau horaire (timezone)**.

### Cause technique

Quand JavaScript convertit une date au format `YYYY-MM-DD` (ex: `2026-02-21`) en objet `Date`, il assume que c'est une date UTC et la convertit selon le fuseau horaire local. Pour le Québec (UTC-5 ou UTC-4), cela peut causer un décalage d'un jour.

**Exemple du problème :**

```javascript
// ❌ AVANT (problématique)
const date = "2026-02-21";
new Date(date).toLocaleDateString("fr-CA");
// Résultat: "2026-02-20" (décalé d'un jour!)
```

---

## ✅ Solution implémentée

### 1. **Création d'utilitaires de dates** (`/src/lib/dateUtils.ts`)

Un fichier centralisé avec toutes les fonctions nécessaires pour gérer les dates correctement :

| Fonction                      | Usage                                 | Exemple                        |
| ----------------------------- | ------------------------------------- | ------------------------------ |
| `parseLocalDate()`            | Parse une date sans décalage timezone | `parseLocalDate("2026-02-21")` |
| `formatDateForInput()`        | Formate pour `<input type="date">`    | `"2026-02-21"`                 |
| `formatDateShort()`           | Affichage court                       | `"21/02/2026"`                 |
| `formatDateLong()`            | Affichage long                        | `"21 février 2026"`            |
| `formatDateLongWithWeekday()` | Avec jour de semaine                  | `"samedi 21 février 2026"`     |
| `formatRelativeDate()`        | Date relative                         | `"Il y a 2 jours"`             |
| `getTodayForInput()`          | Date d'aujourd'hui pour input         | `"2026-02-21"`                 |

**Exemple d'utilisation correcte :**

```javascript
// ✅ APRÈS (correct)
import { parseLocalDate, formatDateShort } from "../../lib/dateUtils";

const date = "2026-02-21";
formatDateShort(parseLocalDate(date));
// Résultat: "21/02/2026" (correct!)
```

---

### 2. **Composants mis à jour**

Les composants suivants ont été corrigés pour utiliser les nouveaux utilitaires :

✅ **`ProjectList.tsx`**

- Utilise `getTodayForInput()` pour la date de début
- Affiche les dates avec `formatDateShort()`

✅ **`VisitDetail.tsx`**

- Affiche la date de visite avec `formatDateLongWithWeekday()`
- Formate correctement toutes les dates

✅ **`QuickVisit.tsx`**

- Initialise la date de visite avec `getTodayForInput()`

✅ **`IssueDetail.tsx`**

- Utilise `parseLocalDate()` pour parser les dates
- Affiche avec `formatDateLongWithWeekday()`
- Utilise `formatDateForInput()` pour l'édition

✅ **`IssueCreation.tsx`**

- Initialise la date d'échéance avec `getTodayForInput()`

✅ **`ActivityFeed.tsx`**

- Affiche les dates relatives avec `formatRelativeDate()`

✅ **`CommentThread.tsx`**

- Affiche les timestamps avec `formatRelativeDate()`

✅ **`Dashboard.tsx`**

- Formate les dates avec `formatDateShort()`

---

## 🧪 Comment tester

### Test 1 : Création de projet

```
1. Allez sur "Mes Projets"
2. Créez un nouveau projet
3. Sélectionnez la date d'aujourd'hui
4. Sauvegardez
5. ✅ Vérifiez que la date affichée correspond bien à celle sélectionnée
```

### Test 2 : Création de visite

```
1. Créez une nouvelle visite
2. Sélectionnez une date (ex: 25 février 2026)
3. Sauvegardez
4. Ouvrez la visite
5. ✅ La date doit afficher "mardi 25 février 2026"
```

### Test 3 : Création de déficience

```
1. Créez une déficience avec date d'échéance
2. Sélectionnez le 28 février 2026
3. Sauvegardez
4. ✅ La date doit s'afficher correctement (pas 27 février)
```

### Test 4 : Affichage relatif

```
1. Ajoutez un commentaire
2. ✅ Il doit afficher "À l'instant"
3. Rechargez après quelques minutes
4. ✅ Doit afficher "Il y a X minutes"
```

---

## 📝 Formats de dates disponibles

### Pour les inputs HTML (`<input type="date">`)

```javascript
import { getTodayForInput, formatDateForInput } from "../../lib/dateUtils";

// Date d'aujourd'hui
const today = getTodayForInput(); // "2026-02-21"

// Formater une date pour un input
const inputDate = formatDateForInput(new Date()); // "2026-02-21"
```

### Pour l'affichage

```javascript
import {
  formatDateShort,
  formatDateLong,
  formatDateLongWithWeekday,
  formatRelativeDate,
} from "../../lib/dateUtils";

const date = "2026-02-21";

formatDateShort(date); // "21/02/2026"
formatDateLong(date); // "21 février 2026"
formatDateLongWithWeekday(date); // "samedi 21 février 2026"
formatRelativeDate(date); // "Il y a 2 jours"
```

### Pour parser des dates

```javascript
import { parseLocalDate } from "../../lib/dateUtils";

// Parse une date YYYY-MM-DD sans décalage
const date = parseLocalDate("2026-02-21");
// Retourne: Date object avec jour correct
```

---

## 🔧 Règles importantes

### ✅ À FAIRE

```javascript
// Import des utilitaires
import { getTodayForInput, formatDateShort } from "../../lib/dateUtils";

// Initialiser un input date
const [date, setDate] = useState(getTodayForInput());

// Afficher une date
<span>{formatDateShort(project.startDate)}</span>;

// Parser une date avant manipulation
const dateObj = parseLocalDate(dateString);
```

### ❌ À ÉVITER

```javascript
// ❌ NE PAS utiliser directement
new Date().toISOString().split("T")[0]; // Peut causer des décalages

// ❌ NE PAS utiliser directement
new Date(dateString).toLocaleDateString(); // Décalage timezone

// ❌ NE PAS créer de Date avec string YYYY-MM-DD
new Date("2026-02-21"); // Problème de timezone
```

---

## 🌍 Support international

Toutes les fonctions supportent la locale `fr-CA` (français canadien) par défaut, mais peuvent être configurées :

```javascript
formatDateLong("2026-02-21", "fr-FR"); // Format France
formatDateLong("2026-02-21", "en-US"); // Format US
```

---

## 📊 Avant / Après

### AVANT ❌

```
Sélection: 21 février 2026
Affichage: 20 février 2026  ← ERREUR!
```

### APRÈS ✅

```
Sélection: 21 février 2026
Affichage: samedi 21 février 2026  ← CORRECT!
```

---

## 🎯 Points clés

1. ✅ Toutes les dates sont maintenant correctes
2. ✅ Pas de décalage de fuseau horaire
3. ✅ Format français québécois (`fr-CA`)
4. ✅ Dates relatives pour les commentaires
5. ✅ Fonctions centralisées et réutilisables
6. ✅ Compatible avec les inputs HTML

---

## 💡 Pour les développeurs

Si vous devez ajouter une nouvelle fonctionnalité avec des dates :

1. **Importez les utilitaires** : `import { ... } from '../../lib/dateUtils'`
2. **Utilisez `getTodayForInput()`** pour initialiser les inputs
3. **Utilisez `formatDateShort/Long()`** pour l'affichage
4. **Utilisez `parseLocalDate()`** avant toute manipulation de date
5. **NE créez PAS** de nouvelles fonctions de formatage de date

---

**Date de la correction :** 21 février 2026  
**Fichiers modifiés :** 10+  
**Problème :** ✅ Résolu complètement
