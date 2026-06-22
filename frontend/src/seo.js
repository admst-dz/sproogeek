const SITE_URL = 'https://sproogeek.com';
const DEFAULT_IMAGE = `${SITE_URL}/og-image.png`;
const PUBLIC_ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

const PRODUCT_SEO = {
    notebook: {
        title: '3D-конструктор ежедневника с логотипом | Sproogeek',
        description: 'Создайте ежедневник с логотипом в онлайн-конструкторе Sproogeek: настройте формат, переплёт, цвета и оцените результат в 3D.',
    },
    thermos: {
        title: '3D-конструктор термоса с логотипом | Sproogeek',
        description: 'Настройте цвет термоса, загрузите логотип и посмотрите готовый дизайн в интерактивном 3D-конструкторе Sproogeek.',
    },
    powerbank: {
        title: '3D-конструктор повербанка с логотипом | Sproogeek',
        description: 'Создайте дизайн повербанка с вашим логотипом и проверьте расположение нанесения в 3D до оформления заказа.',
    },
    sticker: {
        title: '3D-конструктор стикеров с логотипом | Sproogeek',
        description: 'Загрузите изображение и подготовьте собственный дизайн стикера в онлайн-конструкторе Sproogeek.',
    },
    shopper: {
        title: '3D-конструктор шоппера с логотипом | Sproogeek',
        description: 'Создайте брендированный шоппер: выберите цвет, добавьте логотип и оцените макет в 3D онлайн.',
    },
    tshirt: {
        title: '3D-конструктор футболки с логотипом | Sproogeek',
        description: 'Соберите дизайн футболки с принтом или логотипом и посмотрите результат в интерактивном 3D-конструкторе.',
    },
    hoodie: {
        title: '3D-конструктор худи с логотипом | Sproogeek',
        description: 'Создайте макет брендированного худи: настройте цвет, загрузите логотип и проверьте дизайн в 3D.',
    },
    lanyard: {
        title: '3D-конструктор ланъярда с логотипом | Sproogeek',
        description: 'Подготовьте дизайн ланъярда с фирменными цветами и логотипом в онлайн-конструкторе Sproogeek.',
    },
};

const HOME_SEO = {
    title: 'Sproogeek 3D — конструктор брендированных вещей',
    description: 'Создавайте ежедневники, термосы, одежду и аксессуары с вашим логотипом в онлайн-конструкторе с 3D-предпросмотром.',
    canonical: `${SITE_URL}/`,
    robots: PUBLIC_ROBOTS,
};

function upsertMeta(selector, attributes) {
    let element = document.head.querySelector(selector);
    if (!element) {
        element = document.createElement('meta');
        document.head.appendChild(element);
    }
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
}

function upsertCanonical(href) {
    let element = document.head.querySelector('link[rel="canonical"]');
    if (!element) {
        element = document.createElement('link');
        element.setAttribute('rel', 'canonical');
        document.head.appendChild(element);
    }
    element.setAttribute('href', href);
}

function getSeoData(screen, activeProduct) {
    if (screen === 'home') return HOME_SEO;

    if (screen === 'configurator' && PRODUCT_SEO[activeProduct]) {
        return {
            ...PRODUCT_SEO[activeProduct],
            canonical: `${SITE_URL}/configurator/${activeProduct}`,
            robots: PUBLIC_ROBOTS,
        };
    }

    if (screen === 'cookie_policy') {
        return {
            title: 'Политика использования файлов cookie | Sproogeek',
            description: 'Информация об использовании файлов cookie на сайте Sproogeek.',
            canonical: `${SITE_URL}/cookie-policy`,
            robots: 'noindex, follow',
        };
    }

    return {
        title: 'Sproogeek 3D',
        description: HOME_SEO.description,
        canonical: `${SITE_URL}${window.location.pathname}`,
        robots: 'noindex, nofollow',
    };
}

export function applySeoMetadata(screen, activeProduct) {
    const seo = getSeoData(screen, activeProduct);

    document.title = seo.title;
    upsertCanonical(seo.canonical);
    upsertMeta('meta[name="description"]', { name: 'description', content: seo.description });
    upsertMeta('meta[name="robots"]', { name: 'robots', content: seo.robots });
    upsertMeta('meta[name="googlebot"]', { name: 'googlebot', content: seo.robots });
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: seo.title });
    upsertMeta('meta[property="og:description"]', { property: 'og:description', content: seo.description });
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: seo.canonical });
    upsertMeta('meta[property="og:image"]', { property: 'og:image', content: DEFAULT_IMAGE });
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: seo.title });
    upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: seo.description });
    upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: DEFAULT_IMAGE });
}
