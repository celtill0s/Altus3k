// Petits utilitaires sans dépendance (échappement HTML, types de fichiers).
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function isVideoFile(filename) {
  return /\.(mp4|webm|mov|m4v|ogv|avi|mkv)$/i.test(filename || '');
}

// HEIC/HEIF (photos iPhone) : affichable nativement par Safari uniquement.
export function isHeicFile(filename) {
  return /\.(heic|heif)$/i.test(filename || '');
}

// Le catalogue est éditable par quiconque forke le dépôt : tous ses champs sont échappés avant
// insertion dans le HTML, et seuls les liens http(s) sont rendus cliquables.
export function safeUrl(url) {
  return /^https?:\/\//i.test(url || '') ? url : '';
}

// « 2026-08-12 » → « 12/08/2026 » (dates d'ascension).
export function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

// « 2025-08-12 » → « 12 août 2025 » (fiche d'un sommet, où la place ne manque pas en largeur).
export function formatLongDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '';
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Date du jour (heure locale) au format AAAA-MM-JJ.
export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
