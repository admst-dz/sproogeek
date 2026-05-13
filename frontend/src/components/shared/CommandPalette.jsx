import { useCallback, useEffect, useState, useMemo } from 'react';
import { Command } from 'cmdk';
import { useConfigurator } from '../../store';
import { t } from '../../i18n';

export const CommandPalette = ({ navigate, screen, onClose, openAuth, open: controlledOpen, onOpenChange }) => {
    const isControlled = typeof controlledOpen === 'boolean';
    const [internalOpen, setInternalOpen] = useState(false);
    const open = isControlled ? controlledOpen : internalOpen;
    const setOpen = useCallback((value) => {
        if (isControlled) {
            const nextOpen = typeof value === 'function' ? value(controlledOpen) : value;
            onOpenChange?.(nextOpen);
        } else {
            setInternalOpen(value);
        }
    }, [controlledOpen, isControlled, onOpenChange]);
    const [query, setQuery] = useState('');

    const {
        currentUser, userRole, theme, toggleTheme, logout,
        activeProduct, setProduct, resetConfigurator, language,
    } = useConfigurator();

    useEffect(() => {
        if (isControlled) return undefined;

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
    }, [isControlled, open, setOpen]);

    useEffect(() => {
        if (isControlled) return undefined;

        const openPalette = () => setOpen(true);
        window.addEventListener('spruzhuk:open-command-palette', openPalette);
        return () => window.removeEventListener('spruzhuk:open-command-palette', openPalette);
    }, [isControlled, setOpen]);

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
        const nav = t(language, 'cmdGroupNav');
        const cfg = t(language, 'cmdGroupCfg');
        const actions = t(language, 'cmdGroupActions');
        list.push({ group: nav, id: 'nav-home', label: t(language, 'cmdHome'), shortcut: 'G H', onSelect: () => go('home') });
        if (currentUser) {
            if (userRole === 'client' || !userRole) {
                list.push({ group: nav, id: 'nav-dashboard', label: t(language, 'cmdDashboard'), onSelect: () => go('client_dashboard') });
            }
            if (userRole === 'dealer') {
                list.push({ group: nav, id: 'nav-dealer', label: t(language, 'cmdDealerCab'), onSelect: () => go('dealer') });
            }
            if (userRole === 'manufacturer') {
                list.push({ group: nav, id: 'nav-manufacturer', label: t(language, 'cmdManufacturerCab'), onSelect: () => go('manufacturer') });
            }
            if (userRole === 'admin' || userRole === 'owner') {
                list.push({ group: nav, id: 'nav-admin', label: t(language, 'cmdAdminPanel'), onSelect: () => go('admin_dashboard') });
            }
        }
        list.push({ group: cfg, id: 'cfg-notebook', label: t(language, 'notebook'), onSelect: () => goConfigurator('notebook') });
        list.push({ group: cfg, id: 'cfg-thermos', label: t(language, 'thermos'), onSelect: () => goConfigurator('thermos') });
        list.push({ group: cfg, id: 'cfg-powerbank', label: t(language, 'powerbank'), onSelect: () => goConfigurator('powerbank') });
        list.push({
            group: actions,
            id: 'act-theme',
            label: theme === 'dark' ? t(language, 'cmdLightTheme') : t(language, 'cmdDarkTheme'),
            onSelect: () => { toggleTheme(); close(); },
        });
        if (screen === 'configurator') {
            list.push({
                group: actions,
                id: 'act-reset',
                label: `${t(language, 'cmdResetConfigurator')} (${activeProduct})`,
                onSelect: () => { resetConfigurator(activeProduct); close(); },
            });
        }
        if (currentUser) {
            list.push({
                group: actions,
                id: 'act-logout',
                label: t(language, 'cmdLogoutAccount'),
                onSelect: () => { logout(); close(); navigate?.('home'); },
            });
        } else {
            list.push({
                group: actions,
                id: 'act-login',
                label: t(language, 'cmdLoginAction'),
                onSelect: () => { close(); openAuth?.(); },
            });
        }
        return list;
    }, [currentUser, userRole, theme, screen, activeProduct, language]); // eslint-disable-line react-hooks/exhaustive-deps

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
                label={t(language, 'cmdPaletteLabel')}
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
                        placeholder={t(language, 'cmdPlaceholder')}
                        className="flex-1 bg-transparent outline-none text-[15px] text-black dark:text-white placeholder-black/40 dark:placeholder-white/30"
                    />
                    <kbd className="hidden sm:inline text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md bg-black/5 dark:bg-white/10 text-black/50 dark:text-white/50">Esc</kbd>
                </div>
                <Command.List className="max-h-[60vh] overflow-y-auto p-2">
                    <Command.Empty className="text-center text-sm text-black/40 dark:text-white/40 py-8">
                        {t(language, 'cmdEmpty')}
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
                    <span>{t(language, 'cmdNavHint')}</span>
                    <span>{t(language, 'cmdSelectHint')}</span>
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
