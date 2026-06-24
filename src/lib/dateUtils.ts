/**
 * Utilitaires pour gérer les dates sans problèmes de fuseau horaire
 */

/**
 * Parse une date au format YYYY-MM-DD sans décalage de timezone
 * Utilise UTC pour éviter les problèmes de fuseau horaire
 */
export function parseLocalDate(dateString: string): Date {
  if (!dateString) return new Date();
  
  // Si c'est déjà un objet Date, le retourner tel quel
  if (dateString instanceof Date) return dateString;
  
  // Si c'est une date ISO complète (avec heure), la parser normalement
  if (dateString.includes('T')) {
    return new Date(dateString);
  }
  
  // Pour les dates au format YYYY-MM-DD, parser en UTC pour éviter les décalages
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Formate une date au format YYYY-MM-DD pour les inputs HTML
 */
export function formatDateForInput(date: Date | string): string {
  if (!date) return '';
  
  const dateObj = typeof date === 'string' ? parseLocalDate(date) : date;
  
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Formate une date pour l'affichage en français (format court)
 * Ex: 2026-02-21 => 21 février 2026
 */
export function formatDateLong(date: Date | string, locale: string = 'fr-CA'): string {
  if (!date) return '';
  
  const dateObj = typeof date === 'string' ? parseLocalDate(date) : date;
  
  return dateObj.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Formate une date pour l'affichage en français (format avec jour de semaine)
 * Ex: 2026-02-21 => vendredi 21 février 2026
 */
export function formatDateLongWithWeekday(date: Date | string, locale: string = 'fr-CA'): string {
  if (!date) return '';
  
  const dateObj = typeof date === 'string' ? parseLocalDate(date) : date;
  
  return dateObj.toLocaleDateString(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Formate une date pour l'affichage court
 * Ex: 2026-02-21 => 21/02/2026
 */
export function formatDateShort(date: Date | string, locale: string = 'fr-CA'): string {
  if (!date) return '';
  
  const dateObj = typeof date === 'string' ? parseLocalDate(date) : date;
  
  return dateObj.toLocaleDateString(locale);
}

/**
 * Obtient la date d'aujourd'hui au format YYYY-MM-DD
 */
export function getTodayForInput(): string {
  const today = new Date();
  return formatDateForInput(today);
}

/**
 * Calcule la différence en jours entre deux dates
 */
export function daysBetween(date1: Date | string, date2: Date | string): number {
  const d1 = typeof date1 === 'string' ? parseLocalDate(date1) : date1;
  const d2 = typeof date2 === 'string' ? parseLocalDate(date2) : date2;
  
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Formate une date relative (il y a X jours, etc.)
 */
export function formatRelativeDate(date: Date | string): string {
  if (!date) return '';
  
  const dateObj = typeof date === 'string' ? parseLocalDate(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) {
    return 'À l\'instant';
  } else if (diffMins < 60) {
    return `Il y a ${diffMins} minute${diffMins > 1 ? 's' : ''}`;
  } else if (diffHours < 24) {
    return `Il y a ${diffHours} heure${diffHours > 1 ? 's' : ''}`;
  } else if (diffDays < 7) {
    return `Il y a ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `Il y a ${weeks} semaine${weeks > 1 ? 's' : ''}`;
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `Il y a ${months} mois`;
  } else {
    const years = Math.floor(diffDays / 365);
    return `Il y a ${years} an${years > 1 ? 's' : ''}`;
  }
}

/**
 * Extrait seulement la partie date (sans heure) d'un timestamp
 * Retourne au format YYYY-MM-DD
 */
export function extractDateOnly(dateString: string | Date): string {
  if (!dateString) return '';
  
  const dateObj = typeof dateString === 'string' ? new Date(dateString) : dateString;
  
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Compare si une date est dans une plage (en ignorant les heures)
 * Utile pour filtrer les photos/visites par date
 */
export function isDateInRange(
  dateToCheck: string | Date,
  startDate: string,
  endDate: string
): boolean {
  const checkDateOnly = extractDateOnly(dateToCheck);
  return checkDateOnly >= startDate && checkDateOnly <= endDate;
}