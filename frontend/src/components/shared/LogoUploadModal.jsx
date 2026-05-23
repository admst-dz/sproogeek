import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { logoTransferApi, resolveApiUrl } from '../../api';
import { t } from '../../i18n';
import { useConfigurator } from '../../store';
import { isLogoFileTooLarge, isSupportedLogoFile, LOGO_ACCEPT } from '../../utils/logoUpload';

const SESSION_POLL_MS = 2200;

const fileError = (file, language) => {
    if (!file) return t(language, 'logoUploadNoFile');
    if (!isSupportedLogoFile(file)) return t(language, 'logoUploadUnsupported');
    if (isLogoFileTooLarge(file)) return t(language, 'logoUploadTooLarge');
    return '';
};

export const LogoUploadModal = ({ open, onClose, onFile }) => {
    const language = useConfigurator((state) => state.language);
    const inputRef = useRef(null);
    const consumedRemoteRef = useRef(false);
    const [session, setSession] = useState(null);
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState('');
    const [dragging, setDragging] = useState(false);

    const close = useCallback(() => {
        setDragging(false);
        onClose?.();
    }, [onClose]);

    const ingestFile = useCallback(async (file, nextStatus = 'ready') => {
        const message = fileError(file, language);
        if (message) {
            setError(message);
            return;
        }
        setError('');
        setStatus('processing');
        try {
            await onFile?.(file);
            setStatus(nextStatus);
            window.setTimeout(close, 650);
        } catch {
            setStatus('error');
            setError(t(language, 'logoUploadFailed'));
        }
    }, [close, language, onFile]);

    const handlePickedFile = useCallback((file) => {
        if (!file) return;
        consumedRemoteRef.current = true;
        ingestFile(file);
    }, [ingestFile]);

    const handleRemoteReady = useCallback(async (payload) => {
        if (consumedRemoteRef.current || !payload?.download_url) return;
        consumedRemoteRef.current = true;
        setStatus('processing');
        setError('');
        try {
            const response = await fetch(resolveApiUrl(payload.download_url), { cache: 'no-store' });
            if (!response.ok) throw new Error('download failed');
            const blob = await response.blob();
            const file = new File(
                [blob],
                payload.filename || 'logo.png',
                { type: blob.type || payload.content_type || 'image/png' }
            );
            await ingestFile(file, 'uploaded');
        } catch {
            consumedRemoteRef.current = false;
            setStatus('error');
            setError(t(language, 'logoUploadFailed'));
        }
    }, [ingestFile, language]);

    useEffect(() => {
        if (!open) return undefined;
        let cancelled = false;
        consumedRemoteRef.current = false;
        setSession(null);
        setStatus('loading');
        setError('');

        logoTransferApi.createSession(window.location.origin)
            .then(({ data }) => {
                if (cancelled) return;
                setSession(data);
                setStatus(data?.status || 'pending');
            })
            .catch(() => {
                if (cancelled) return;
                setStatus('error');
                setError(t(language, 'logoUploadSessionError'));
            });

        return () => { cancelled = true; };
    }, [language, open]);

    useEffect(() => {
        if (!open || !session?.session_id || consumedRemoteRef.current) return undefined;
        let cancelled = false;

        const poll = () => {
            logoTransferApi.getSession(session.session_id)
                .then(({ data }) => {
                    if (cancelled || consumedRemoteRef.current) return;
                    setSession((current) => ({ ...(current || {}), ...(data || {}) }));
                    setStatus(data?.status || 'pending');
                    if (data?.status === 'ready') handleRemoteReady(data);
                })
                .catch(() => {
                    if (cancelled) return;
                    setStatus('error');
                    setError(t(language, 'logoUploadSessionError'));
                });
        };

        const timer = window.setInterval(poll, SESSION_POLL_MS);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [handleRemoteReady, language, open, session?.session_id]);

    useEffect(() => {
        if (!open) return undefined;
        const onKeyDown = (event) => {
            if (event.key === 'Escape') close();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [close, open]);

    if (!open || typeof document === 'undefined') return null;

    const qrSrc = session?.qr_url ? resolveApiUrl(session.qr_url) : '';
    const uploadUrl = session?.upload_url || '';
    const waitingForPhone = ['loading', 'pending'].includes(status);
    const processing = status === 'processing';

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/62 px-3 py-4 font-zen text-white backdrop-blur-sm sm:items-center">
            <button
                type="button"
                className="absolute inset-0 cursor-default"
                onClick={close}
                aria-label={t(language, 'logoUploadClose')}
            />
            <section className="relative w-full max-w-[520px] overflow-hidden rounded-[16px] border border-white/18 bg-[#342a2e] shadow-[0_30px_90px_rgba(0,0,0,0.55)]">
                <div className="flex items-start justify-between gap-4 border-b border-white/12 px-5 py-4">
                    <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/42">{t(language, 'logoUploadEyebrow')}</p>
                        <h2 className="mt-1 text-[21px] font-black leading-tight">{t(language, 'logoUploadTitle')}</h2>
                    </div>
                    <button
                        type="button"
                        onClick={close}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/16 bg-white/8 text-white/65 transition hover:bg-white/14 hover:text-white"
                        aria-label={t(language, 'logoUploadClose')}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                        </svg>
                    </button>
                </div>

                <div className="space-y-4 px-5 py-5">
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => inputRef.current?.click()}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                inputRef.current?.click();
                            }
                        }}
                        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
                        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                        onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
                        onDrop={(event) => {
                            event.preventDefault();
                            setDragging(false);
                            handlePickedFile(event.dataTransfer.files?.[0]);
                        }}
                        className={`flex min-h-[156px] cursor-pointer flex-col items-center justify-center rounded-[12px] border border-dashed px-5 py-6 text-center transition ${
                            dragging ? 'border-[#fff9ec] bg-white/16' : 'border-white/24 bg-white/8 hover:bg-white/12'
                        }`}
                    >
                        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[#fff9ec] text-[#211a1d]">
                            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 3v12" />
                                <path d="m7 8 5-5 5 5" />
                                <path d="M5 21h14" />
                            </svg>
                        </div>
                        <p className="text-[15px] font-black leading-tight">{t(language, 'logoUploadDropTitle')}</p>
                        <p className="mt-2 max-w-[340px] text-[12px] font-bold leading-relaxed text-white/52">{t(language, 'logoUploadDropHint')}</p>
                        <button
                            type="button"
                            onClick={(event) => { event.stopPropagation(); inputRef.current?.click(); }}
                            className="mt-4 rounded-full bg-[#fff9ec] px-5 py-2 text-[11px] font-black uppercase tracking-widest text-[#211a1d] transition hover:bg-white active:scale-95"
                        >
                            {t(language, 'logoUploadChooseFile')}
                        </button>
                        <input
                            ref={inputRef}
                            type="file"
                            accept={LOGO_ACCEPT}
                            className="hidden"
                            onChange={(event) => {
                                handlePickedFile(event.target.files?.[0]);
                                event.target.value = '';
                            }}
                        />
                    </div>

                    <div className="grid gap-3 rounded-[12px] border border-white/12 bg-black/12 p-3 sm:grid-cols-[132px_1fr]">
                        <div className="flex min-h-[132px] items-center justify-center rounded-[8px] bg-white p-2">
                            {qrSrc && waitingForPhone ? (
                                <img src={qrSrc} alt={t(language, 'logoUploadQrAlt')} className="h-[116px] w-[116px]" />
                            ) : (
                                <div className="h-[116px] w-[116px] animate-pulse rounded-[6px] bg-black/10" />
                            )}
                        </div>
                        <div className="flex min-w-0 flex-col justify-center">
                            <p className="text-[12px] font-black uppercase tracking-[0.18em] text-white/42">{t(language, 'logoUploadPhoneTitle')}</p>
                            <p className="mt-2 text-[13px] font-bold leading-relaxed text-white/66">{t(language, 'logoUploadPhoneHint')}</p>
                            {uploadUrl && (
                                <a
                                    href={uploadUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-3 truncate rounded-[7px] border border-white/12 bg-white/8 px-3 py-2 text-[11px] font-bold text-white/52 transition hover:text-white"
                                >
                                    {uploadUrl}
                                </a>
                            )}
                            <p className="mt-3 text-[11px] font-bold text-white/42">
                                {processing
                                    ? t(language, 'logoUploadProcessing')
                                    : status === 'uploaded'
                                        ? t(language, 'logoUploadUploaded')
                                        : status === 'expired'
                                            ? t(language, 'logoUploadExpired')
                                            : t(language, 'logoUploadWaiting')}
                            </p>
                        </div>
                    </div>

                    {error && (
                        <div className="rounded-[9px] border border-red-300/25 bg-red-500/12 px-3 py-2 text-[12px] font-bold text-red-100">
                            {error}
                        </div>
                    )}
                </div>
            </section>
        </div>,
        document.body
    );
};
