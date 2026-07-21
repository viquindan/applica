// Flujo de afinamiento del motor de búsqueda: captura el motivo detrás de
// cada swipe positivo/negativo en el Feed, habilitado solo para esta cuenta
// mientras se decide si se generaliza. Fuente única de verdad del gate -
// nunca hardcodear el email en más de un lugar (usado por /api/mobile/me,
// /api/swipe-feedback y el panel de revisión web).
export const SEARCH_TUNING_EMAIL = 'vael27@hotmail.com';

export function isSearchTuningUser(email: string | null | undefined): boolean {
  return email?.toLowerCase() === SEARCH_TUNING_EMAIL;
}
