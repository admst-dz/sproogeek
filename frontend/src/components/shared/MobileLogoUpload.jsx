import { useEffect, useRef, useState } from 'react';
import { logoTransferApi } from '../../api';
import { t } from '../../i18n';
import { useConfigurator } from '../../store';
import {
    isConvertibleLogoFile,
    isLogoSourceTooLarge,
    LOGO_ACCEPT,
    prepareLogoUploadFile,
} from '../../utils/logoUpload';

const validateFile = (file, language) => {
    if (!file) return t(language, 'logoUploadNoFile');
    if (!isConvertibleLogoFile(file)) return t(language, 'logoUploadUnsupported');
    if (isLogoSourceTooLarge(file)) return t(language, 'logoUploadSourceTooLarge');
    return '';
};

const uploadErrorMessage = (err, language) => {
    const code = err?.response?.status;
    const detail = err?.response?.data?.detail;
    if (code === 410) return t(language, 'logoUploadExpired');
    if (code === 404) return t(language, 'logoUploadSessionMissing');
    if (code === 413 || detail === 'File is too large' || detail === 'Payload too large') return t(language, 'logoUploadTooLarge');
    if (code === 400 || detail === 'Unsupported file format' || detail === 'File content does not match declared type') return t(language, 'logoUploadUnsupported');
    return t(language, 'logoUploadFailed');
};

export const MobileLogoUpload = ({ sessionId }) => {
    const language = useConfigurator((state) => state.language);
    const inputRef = useRef(null);
    const [file, setFile] = useState(null);
    const [status, setStatus] = useState('loading');
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        logoTransferApi.getSession(sessionId)
            .then(({ data }) => {
                if (cancelled) return;
                setStatus(data?.status === 'expired' ? 'expired' : 'ready');
            })
            .catch(() => {
                if (cancelled) return;
                setStatus('missing');
            });
        return () => { cancelled = true; };
    }, [sessionId]);

    const pickFile = (nextFile) => {
        const message = validateFile(nextFile, language);
        setFile(message ? null : nextFile);
        setError(message);
    };

    const submit = async () => {
        const message = validateFile(file, language);
        if (message) {
            setError(message);
            return;
        }
        setStatus('uploading');
        setError('');
        try {
            let uploadFile;
            try {
                uploadFile = await prepareLogoUploadFile(file);
            } catch {
                setStatus('ready');
                setError(t(language, 'logoUploadUnsupported'));
                return;
            }
            await logoTransferApi.uploadToSession(sessionId, uploadFile);
            setStatus('done');
        } catch (err) {
            const code = err?.response?.status;
            setStatus(code === 410 ? 'expired' : 'ready');
            setError(uploadErrorMessage(err, language));
        }
    };

    const disabled = status === 'loading' || status === 'uploading' || status === 'done' || status === 'expired' || status === 'missing';

    return (
        <main className="min-h-screen bg-[#211a1d] px-4 py-6 font-zen text-white">
            <section className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-[460px] flex-col justify-center">
                <div className="rounded-[18px] border border-white/14 bg-white/[0.06] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.35)]">
                    <div className="mb-6">
                        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/42">Spruzhuk</p>
                        <h1 className="mt-2 text-[28px] font-black leading-tight">{t(language, 'logoUploadMobileTitle')}</h1>
                        <p className="mt-3 text-[14px] font-bold leading-relaxed text-white/58">{t(language, 'logoUploadMobileSubtitle')}</p>
                    </div>

                    <button
                        type="button"
                        disabled={disabled}
                        onClick={() => inputRef.current?.click()}
                        className="flex min-h-[152px] w-full flex-col items-center justify-center rounded-[13px] border border-dashed border-white/24 bg-black/16 px-5 py-6 text-center transition enabled:hover:bg-white/10 disabled:opacity-60"
                    >
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#fff9ec] text-[#211a1d]">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 3v12" />
                                <path d="m7 8 5-5 5 5" />
                                <path d="M5 21h14" />
                            </svg>
                        </div>
                        <span className="text-[14px] font-black uppercase tracking-wider">
                            {file?.name || t(language, 'logoUploadMobileChoose')}
                        </span>
                        <span className="mt-2 text-[12px] font-bold leading-relaxed text-white/45">
                            {t(language, 'logoUploadMobileHint')}
                        </span>
                    </button>

                    <input
                        ref={inputRef}
                        type="file"
                        accept={LOGO_ACCEPT}
                        className="hidden"
                        onChange={(event) => {
                            pickFile(event.target.files?.[0]);
                            event.target.value = '';
                        }}
                    />

                    {error && (
                        <div className="mt-4 rounded-[10px] border border-red-300/25 bg-red-500/12 px-3 py-2 text-[12px] font-bold text-red-100">
                            {error}
                        </div>
                    )}

                    {status === 'done' && (
                        <div className="mt-4 rounded-[10px] border border-emerald-300/25 bg-emerald-500/12 px-3 py-2 text-[12px] font-bold text-emerald-100">
                            {t(language, 'logoUploadMobileSuccess')}
                        </div>
                    )}

                    {(status === 'expired' || status === 'missing') && (
                        <div className="mt-4 rounded-[10px] border border-white/14 bg-white/8 px-3 py-2 text-[12px] font-bold text-white/62">
                            {status === 'expired' ? t(language, 'logoUploadExpired') : t(language, 'logoUploadSessionMissing')}
                        </div>
                    )}

                    <button
                        type="button"
                        disabled={!file || disabled}
                        onClick={submit}
                        className="mt-5 w-full rounded-full bg-[#fff9ec] px-5 py-3 text-[12px] font-black uppercase tracking-widest text-[#211a1d] transition enabled:hover:bg-white enabled:active:scale-[0.98] disabled:opacity-50"
                    >
                        {status === 'uploading' ? t(language, 'logoUploadUploading') : t(language, 'logoUploadMobileSend')}
                    </button>
                </div>
            </section>
        </main>
    );
};
