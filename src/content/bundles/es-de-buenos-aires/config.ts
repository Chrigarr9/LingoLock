import type { BundleConfig } from '../../../types/bundle';

export const config: BundleConfig = {
  id: 'es-de-buenos-aires',
  nativeLanguage: 'Deutsch',
  targetLanguage: 'Español',
  displayLabel: 'Deutsch → Español',
  greetings: {
    morning: 'Buenos días',
    afternoon: 'Buenas tardes',
    evening: 'Buenas noches',
  },
  motivational: {
    perfect: '¡Perfecto! Every answer correct.',
    great: '¡Muy bien! Great session.',
    good: '¡Bien! Keep practising.',
    encouragement: 'Every mistake is a lesson. ¡Ánimo!',
  },
  spellCharacters: 'abcdefghijklmnñopqrstuvwxyzáéíóú'.split(''),
  searchPlaceholder: 'Search Spanish or German...',
};
