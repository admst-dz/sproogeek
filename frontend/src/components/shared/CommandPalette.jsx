import { useEffect, useState, useMemo } from 'react';
import { Command } from 'cmdk';
import { useConfigurator } from '../../store';

export const CommandPalette = ({ navigate, screen, onClose, openAuth }) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');

    const {
        currentUser, userRole, theme, toggleTheme, logout,
        activeProduct, setProduct, resetConfigurator,
    } = useConfigurator();

    useEffect(() => {
        const onKey = (e) => {
            const cmd = e.metaKey || e.ctrlKey;
            if (cmd && (e.key === 'k' || e.key === 'K')) {
                e.preventDefault();
                setOpen((o) => !o);
            } else if (e.key === 'Escape' && open) {
                e.preventDefault();
                setOpen(false);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    useEffect(() => {
        const openPalette = () => setOpen(true);
        window.addEventListener('spruzhuk:open-command-palette', openPalette);
        return () => window.removeEventListener('spruzhuk:open-command-palette', openPalette);
    }, []);

    useEffect(() => {
        if (!open) setQuery('');
    }, [open]);

    const close = () => { setOpen(false); onClose?.(); };

    const go = (target) => {
        navigate?.(target);
        close();
    };

    const goConfigurator = (product) => {
        setProduct(product);
        navigate?.('configurator');
        close();
    };

    const items = useMemo(() => {
        const list = [];
        // Навигация
        list.push({ group: 'Навигация', id: 'nav-home', label: 'Главная', shortcut: 'G H', onSelect: () => go('home') });
        if (currentUser) {
            if (userRole === 'client' || !userRole) {
                list.push({ group: 'Навигация', id: 'nav-dashboard', label: 'Личный кабинет', onSelect: () => go('client_dashboard') });
            }
            if (userRole === 'dealer') {
                list.push({ group: 'Навигация', id: 'nav-dealer', label: 'Кабинет дилера', onSelect: () => go('dealer') });
            }
            if (userRole === 'manufacturer') {
                list.push({ group: 'Навигация', id: 'nav-manufacturer', label: 'Кабинет производства', onSelect: () => go('manufacturer') });
            }
            if (userRole === 'admin' || userRole === 'owner') {
                list.push({ group: 'Навигация', id: 'nav-admin', label: 'Админ-панель', onSelect: () => go('admin_dashboard') });
            }
        }
        // Конструктор
        list.push({ group: 'Конструктор', id: 'cfg-notebook', label: 'Ежедневник', onSelect: () => goConfigurator('notebook') });
        list.push({ group: 'Конструктор', id: 'cfg-thermos', label: 'Термос', onSelect: () => goConfigurator('thermos') });
        list.push({ group: 'Конструктор', id: 'cfg-powerbank', label: 'Повербанк', onSelect: () => goConfigurator('powerbank') });
        // Действия
        list.push({
            group: 'Действия',
            id: 'act-theme',
            label: theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему',
            onSelect: () => { toggleTheme(); close(); },
        });
        if (screen === 'configurator') {
            list.push({
                group: 'Действия',
                id: 'act-reset',
                label: `Сбросить конфигуратор (${activeProduct})`,
                onSelect: () => { resetConfigurator(activeProduct); close(); },
            });
        }
        if (currentUser) {
            list.push({
                group: 'Действия',
                id: 'act-logout',
                label: 'Выйти из аккаунта',
                onSelect: () => { logout(); close(); navigate?.('home'); },
            });
        } else {
            list.push({
                group: 'Действия',
                id: 'act-login',
                label: 'Войти',
                onSelect: () => { close(); openAuth?.(); },
            });
        }
        return list;
    }, [currentUser, userRole, theme, screen, activeProduct]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!open) return null;

    const grouped = items.reduce((acc, it) => {
        (acc[it.group] ||= []).push(it);
        return acc;
    }, {});

    return (
        <div
            className="fixed inset-0 z-[200] flex items-start justify-center pt-[12vh] bg-black/55 backdrop-blur-sm animate-fade-in"
            onClick={close}
        >
            <Command
                label="Командное меню"
                shouldFilter
                className="w-[92vw] max-w-[560px] bg-white dark:bg-[#10172A] border border-black/10 dark:border-white/10 rounded-[16px] shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center gap-3 px-4 py-3 border-b border-black/10 dark:border-white/10">
                    <SearchIcon />
                    <Command.Input
                        autoFocus
                        value={query}
                        onValueChange={setQuery}
                        placeholder="Куда идём, что делаем?"
                        className="flex-1 bg-transparent outline-none text-[15px] text-black dark:text-white placeholder-black/40 dark:placeholder-white/30"
                    />
                    <kbd className="hidden sm:inline text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md bg-black/5 dark:bg-white/10 text-black/50 dark:text-white/50">Esc</kbd>
                </div>
                <Command.List className="max-h-[60vh] overflow-y-auto p-2">
                    <Command.Empty className="text-center text-sm text-black/40 dark:text-white/40 py-8">
                        Ничего не найдено
                    </Command.Empty>
                    {Object.entries(grouped).map(([group, list]) => (
                        <Command.Group
                            key={group}
                            heading={group}
                            className="text-[10px] font-bold uppercase tracking-widest text-black/40 dark:text-white/40 px-2 pt-3 pb-1"
                        >
                            {list.map((it) => (
                                <Command.Item
                                    key={it.id}
                                    value={`${group} ${it.label}`}
                                    onSelect={it.onSelect}
                                    className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-[10px] text-sm text-black dark:text-white cursor-pointer aria-selected:bg-black/5 dark:aria-selected:bg-white/10 transition-colors"
                                >
                                    <span>{it.label}</span>
                                    {it.shortcut && (
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-black/30 dark:text-white/30">{it.shortcut}</span>
                                    )}
                                </Command.Item>
                            ))}
                        </Command.Group>
                    ))}
                </Command.List>
                <div className="flex items-center justify-between px-4 py-2 border-t border-black/10 dark:border-white/10 text-[10px] font-bold uppercase tracking-widest text-black/40 dark:text-white/40">
                    <span>↑ ↓ — навигация</span>
                    <span>↵ — выбрать</span>
                </div>
            </Command>
        </div>
    );
};

const SearchIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-black/50 dark:text-white/40">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
);
