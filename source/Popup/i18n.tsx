import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n.use(LanguageDetector).init({
  resources: {
    en: {
      translation: {
        start: 'Start Recording',
        stop: 'Stop Recording',
        download: 'Download Script',
        options: 'Options',
      },
    },
  },
  defaultNS: 'translation',
  fallbackLng: 'en',
  debug: false,
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
