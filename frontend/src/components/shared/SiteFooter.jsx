import { useConfigurator } from '../../store';
import { ORGANIZATION_INFO } from '../../utils/organizationInfo';

const labels = {
    ru: {
        org: 'Организация',
        email: 'Email для обращений',
        phone: 'Телефон',
        telegram: 'Telegram',
        address: 'Юридический адрес',
        cookies: 'Политика cookie',
        copyright: 'Все права защищены',
    },
    en: {
        org: 'Organization',
        email: 'Inquiries email',
        phone: 'Phone',
        telegram: 'Telegram',
        address: 'Legal address',
        cookies: 'Cookie policy',
        copyright: 'All rights reserved',
    },
    by: {
        org: 'Арганізацыя',
        email: 'Email для зваротаў',
        phone: 'Тэлефон',
        telegram: 'Telegram',
        address: 'Юрыдычны адрас',
        cookies: 'Палітыка cookie',
        copyright: 'Усе правы абаронены',
    },
};

const FooterItem = ({ label, children }) => (
    <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-500 dark:text-[#B8B8B8]">{label}</p>
        <div className="mt-1 text-sm font-bold text-gray-900 dark:text-[#D6D6D6] break-words">{children}</div>
    </div>
);

const FooterLink = ({ href, children }) => (
    <a
        className="text-gray-900 underline-offset-4 transition hover:text-blue-700 hover:underline dark:text-[#D6D6D6] dark:hover:text-[#FFFFFF]"
        href={href}
        target={href?.startsWith('http') ? '_blank' : undefined}
        rel={href?.startsWith('http') ? 'noreferrer' : undefined}
    >
        {children}
    </a>
);

export const SiteFooter = ({ className = '', compact = false }) => {
    const { language } = useConfigurator();
    const copy = labels[language] || labels.ru;
    const localizedInfo = ORGANIZATION_INFO.localized?.[language] || ORGANIZATION_INFO.localized?.ru || ORGANIZATION_INFO;
    const year = new Date().getFullYear();

    return (
        <footer className={`w-full shrink-0 border-t border-black/10 bg-transparent text-gray-900 dark:border-white/12 dark:text-[#D6D6D6] ${className}`}>
            <div className={`mx-auto w-full max-w-7xl px-4 sm:px-6 ${compact ? 'py-5' : 'py-6 md:py-7'}`}>
                <div className="grid gap-5 md:grid-cols-[1.1fr_2fr] md:items-start">
                    <div className="min-w-0">
                        <p className="text-base font-black tracking-wide text-gray-950 dark:text-[#DCDCDC]">Sproogeek 3D</p>
                        <p className="mt-1 text-xs font-bold text-gray-600 dark:text-[#C8C8C8]">
                            © {year} {ORGANIZATION_INFO.name}. {copy.copyright}.
                        </p>
                        <a
                            href={ORGANIZATION_INFO.cookiePolicyPath}
                            className="mt-2 inline-block text-xs font-bold uppercase tracking-widest text-gray-700 underline-offset-4 transition hover:text-gray-950 hover:underline dark:text-[#D0D0D0] dark:hover:text-[#FFFFFF]"
                        >
                            {copy.cookies}
                        </a>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                        <FooterItem label={copy.org}>{localizedInfo.legalName}</FooterItem>
                        <FooterItem label={copy.email}>
                            <FooterLink href={`mailto:${ORGANIZATION_INFO.email}`}>{ORGANIZATION_INFO.email}</FooterLink>
                        </FooterItem>
                        <FooterItem label={copy.phone}>
                            <FooterLink href={`tel:${ORGANIZATION_INFO.phoneHref}`}>{ORGANIZATION_INFO.phone}</FooterLink>
                        </FooterItem>
                        <FooterItem label={copy.telegram}>
                            <FooterLink href={ORGANIZATION_INFO.telegramHref}>{ORGANIZATION_INFO.telegram}</FooterLink>
                        </FooterItem>
                        <FooterItem label={copy.address}>{localizedInfo.legalAddress}</FooterItem>
                    </div>
                </div>
            </div>
        </footer>
    );
};
