import { useConfigurator } from '../../store';
import { t } from '../../i18n';

const storageRows = [
    ['spruzhuk_auth', 'cookie', 'JWT-токен авторизации, если пользователь принял cookie; используется для входа в личный кабинет.', 'до 30 дней'],
    ['spruzhuk_cart', 'cookie', 'Сохранение незавершённого заказа/корзины, чтобы пользователь мог продолжить оформление.', 'до 7 дней'],
    ['spruzhuk_cookie_consent', 'localStorage', 'Фиксирует выбор пользователя в cookie-баннере: accepted или declined.', 'до очистки браузера'],
    ['token', 'localStorage', 'Токен авторизации в браузере при восстановлении сессии.', 'до выхода из аккаунта или очистки браузера'],
    ['spruzhuk_configurator_draft', 'localStorage', 'Черновик конфигуратора: выбранный продукт, цвета, параметры модели, масштаб и т.п.', 'до удаления черновика или очистки браузера'],
    ['spruzhuk_scene_hints_dismissed', 'localStorage', 'Запоминает, что пользователь скрыл подсказки управления 3D-сценой.', 'до очистки браузера'],
    ['spruzhuk_yandex_oauth_state', 'sessionStorage', 'Временная защита OAuth-перехода при входе через Яндекс.', 'до закрытия вкладки или завершения входа'],
    ['spruzhuk_vk_oauth_state', 'sessionStorage', 'Временная защита OAuth-перехода при входе через VK.', 'до закрытия вкладки или завершения входа'],
    ['_ym_uid, _ym_d, _ym_isad, _ym_visorc', 'cookie третьей стороны', 'Яндекс.Метрика: статистика посещений, карта кликов, вебвизор и техническая аналитика.', 'обычно до 2 лет или согласно настройкам Яндекса'],
];

const Section = ({ title, children }) => (
    <section className="space-y-3">
        <h2 className="text-xl md:text-2xl font-black tracking-tight text-gray-900 dark:text-white">{title}</h2>
        <div className="space-y-3 text-sm md:text-base leading-relaxed text-gray-600 dark:text-gray-300">
            {children}
        </div>
    </section>
);

export const CookiePolicy = ({ onBack }) => {
    const { language } = useConfigurator();

    return (
        <div className="app-bg h-full min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar font-sans text-gray-900 dark:text-white transition-colors">
            <header className="sticky top-0 z-20 border-b border-gray-200/70 dark:border-white/10 bg-[#E5E5E5]/90 dark:bg-[#080B13]/90 backdrop-blur-xl">
                <div className="max-w-5xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={onBack}
                        className="px-4 py-2 rounded-full bg-white dark:bg-white/10 border border-black/5 dark:border-white/10 text-xs font-bold uppercase tracking-widest text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-white/15 transition"
                    >
                        {t(language, 'orderBackEditor')}
                    </button>
                    <a
                        href="/docs/cookie-policy.docx"
                        className="px-4 py-2 rounded-full bg-gray-900 dark:bg-white text-white dark:text-[#080B13] text-xs font-bold uppercase tracking-widest hover:bg-gray-800 dark:hover:bg-gray-100 transition"
                    >
                        DOCX
                    </a>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 md:px-8 py-10 md:py-14">
                <div className="mb-10">
                    <p className="text-xs font-bold uppercase tracking-[0.24em] text-blue-600 dark:text-blue-300 mb-3">Sproogeek</p>
                    <h1 className="text-3xl md:text-5xl font-black tracking-tight text-gray-900 dark:text-white">
                        Политика использования файлов cookie
                    </h1>
                    <p className="mt-4 text-sm md:text-base text-gray-500 dark:text-gray-400">
                        Для сайта <a href="https://sproogeek.com" className="underline underline-offset-4">https://sproogeek.com</a>
                    </p>
                </div>

                <div className="space-y-10">
                    <Section title="1. Что такое файлы cookie?">
                        <p>Файлы cookie — это небольшие текстовые файлы, которые сохраняются на вашем устройстве при посещении сайта. Они используются для обеспечения работы сайта, сохранения выбранных действий пользователя, авторизации, восстановления незавершённого заказа, а также для анализа работы сайта и улучшения интерфейса.</p>
                    </Section>

                    <Section title="2. Какие типы cookie мы используем?">
                        <p>Сайт использует cookie и похожие технологии хранения данных браузера: cookie, localStorage и sessionStorage.</p>
                        <p><strong>Строго необходимые cookie</strong> нужны для авторизации, сохранения корзины, восстановления сессии и применения выбора в cookie-уведомлении.</p>
                        <p><strong>Функциональные данные</strong> запоминают настройки интерфейса: язык, тему, черновик конфигуратора, скрытые подсказки и временные параметры OAuth-авторизации.</p>
                        <p><strong>Аналитические cookie</strong> используются Яндекс.Метрикой для статистики посещений, карты кликов и вебвизора.</p>
                        <p><strong>Маркетинговые cookie</strong> на текущий момент сайтом не используются.</p>

                        <div className="overflow-x-auto rounded-[14px] border border-gray-200 dark:border-white/10">
                            <table className="w-full min-w-[760px] text-left text-sm">
                                <thead className="bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-white">
                                    <tr>
                                        <th className="px-4 py-3 font-bold">Название</th>
                                        <th className="px-4 py-3 font-bold">Тип</th>
                                        <th className="px-4 py-3 font-bold">Назначение</th>
                                        <th className="px-4 py-3 font-bold">Срок хранения</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                                    {storageRows.map(([name, type, purpose, duration]) => (
                                        <tr key={name} className="bg-white/70 dark:bg-white/[0.03]">
                                            <td className="px-4 py-3 font-mono text-xs text-gray-900 dark:text-white">{name}</td>
                                            <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{type}</td>
                                            <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{purpose}</td>
                                            <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{duration}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Section>

                    <Section title="3. Как долго данные хранятся?">
                        <p>Файлы cookie могут храниться на устройстве пользователя в течение сеанса или в течение фиксированного периода, указанного выше. Пользователь может удалить cookie и данные localStorage/sessionStorage через настройки браузера. При выходе из аккаунта сайт удаляет основные авторизационные и корзинные cookies.</p>
                    </Section>

                    <Section title="4. Как управлять cookie и отозвать согласие?">
                        <p>При первом посещении сайта отображается уведомление о cookie. Кнопка «Принять» разрешает сайту сохранять cookie для авторизации и восстановления заказа. Кнопка «Отклонить» не сохраняет эти cookies: токен авторизации может храниться только временно в памяти вкладки до перезагрузки страницы.</p>
                        <p>Вы можете изменить свой выбор через настройки браузера, удалить cookie/localStorage/sessionStorage, выйти из аккаунта на сайте или использовать официальный отказ от Яндекс.Метрики: <a className="text-blue-600 dark:text-blue-300 underline underline-offset-4" href="https://yandex.ru/support/metrica/general/opt-out.html" target="_blank" rel="noreferrer">https://yandex.ru/support/metrica/general/opt-out.html</a>.</p>
                    </Section>

                    <Section title="5. Передача данных третьим лицам">
                        <p>Мы не продаём данные, полученные с помощью cookie. Технические cookies используются самим сайтом Sproogeek/Spruzhyk. Обезличенные статистические данные могут обрабатываться сервисом Яндекс.Метрика. При входе через Google или Яндекс пользователь взаимодействует с соответствующими сервисами, которые применяют собственные политики конфиденциальности.</p>
                    </Section>

                    <Section title="6. Правовые основания обработки">
                        <p>Обработка строго необходимых и функциональных cookie осуществляется для обеспечения работы сайта, авторизации, оформления заказов и сохранения пользовательских настроек. Обработка аналитических cookie осуществляется для анализа работы сайта и улучшения сервиса. Пользователь может ограничить или удалить такие данные через настройки браузера и инструменты отказа от аналитики.</p>
                    </Section>

                    <Section title="7. Контакты">
                        <p>Если у вас есть вопросы относительно данной Политики, свяжитесь с нами:</p>
                        <p>Оператор данных: [Полное наименование ООО]</p>
                        <p>Юридический адрес: [Ваш адрес]</p>
                        <p>Email: [Ваш email]</p>
                        <p>Дата последнего обновления: [Дата]</p>
                    </Section>
                </div>
            </main>
        </div>
    );
};
