import ru from './i18n/ru';
import en from './i18n/en';
import by from './i18n/by';

export const translations = { ru, en, by };

export const t = (lang, key) => {
    return translations[lang]?.[key] || translations.ru[key] || key;
};
