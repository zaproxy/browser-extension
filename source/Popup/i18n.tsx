import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import XHRBackend from 'i18next-xhr-backend';

i18n
  .use(XHRBackend)
  .use(LanguageDetector)
  .init({
    backend: {
      loadPath: '../assets/locales/{{lng}}/{{ns}}.json',
    },
    fallbackLng: 'en',
    debug: false,
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
