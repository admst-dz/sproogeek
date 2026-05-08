export const translations = {
    ru: {
        constructor: "Конструктор",
        search: "Поиск конструкторов...",
        login: "Войти",
        logout: "Выйти",
        title1: "Спроектируй",
        title2: "идеальный ежедневник",
        subtitle: "Цвета, переплёт, тиснение — собери в три клика и получи готовый макет.",
        notebook: "Ежедневник",
        thermos: "Термос",
        powerbank: "Повербанк",
        openBtn: "Открыть конструктор →",
    },
    en: {
        constructor: "Configurator",
        search: "Search configurators...",
        login: "Log in",
        logout: "Log out",
        title1: "Design your",
        title2: "perfect notebook",
        subtitle: "Colors, binding, embossing — assemble in three clicks and get a ready-made layout.",
        notebook: "Notebook",
        thermos: "Thermos",
        powerbank: "Power Bank",
        openBtn: "Open configurator →",
    },
    by: {
        constructor: "Канструктар",
        search: "Пошук канструктараў...",
        login: "Увайсці",
        logout: "Выйсці",
        title1: "Спраектуй",
        title2: "ідэальны дзённік",
        subtitle: "Колеры, пераплёт, цісненне — збяры ў тры клікі і атрымай гатовы макет.",
        notebook: "Дзённік",
        thermos: "Тэрмас",
        powerbank: "Павэрбанк",
        openBtn: "Адкрыць канструктар →",
    }
};

// Функция-помощник для перевода
export const t = (lang, key) => {
    return translations[lang]?.[key] || translations['ru'][key] || key;
};
