import { useState } from 'react';
import { orderApi } from '../../api';
import { downloadBlob } from '../../utils/download';
import { useConfigurator } from '../../store';
import { t } from '../../i18n';

const STATUS_BADGE_CLS = {
    pending:  'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    approved: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    rejected: 'bg-red-500/20 text-red-300 border-red-500/30',
};

const quoteTime = (days, language) => `${days} ${language === 'en' ? 'days' : language === 'be' ? 'дзён' : 'дн.'}`;

/**
 * Approval panel: PDF generation + download + client decision (approve/reject)
 * + dealer confirmation (push to production).
 *
 * Props:
 *   order        — { id, approvalStatus, approvalPdfKey, dealerConfirmedAt }
 *   role         — 'client' | 'dealer' | 'admin' (controls which buttons render)
 *   onChanged(updatedOrder) — called after a successful state change
 */
export function ApprovalPanel({ order, role, onChanged }) {
    const { language } = useConfigurator();
    const [busy, setBusy] = useState(null);
    const [comment, setComment] = useState('');
    const [error, setError] = useState('');
    const [signedFile, setSignedFile] = useState(null);

    const status = order.approvalStatus || order.approval_status || 'pending';
    const dealerConfirmedAt = order.dealerConfirmedAt || order.dealer_confirmed_at;
    const signedApprovalFileKey = order.signedApprovalFileKey || order.signed_approval_file_key;
    const quotes = order.manufacturerQuotes || order.manufacturer_quotes || [];
    const selectedQuoteId = order.selectedQuoteId || order.selected_quote_id;
    const badgeCls = STATUS_BADGE_CLS[status] || STATUS_BADGE_CLS.pending;
    const badgeText = { pending: t(language, 'approvalPending'), approved: t(language, 'approvalApproved'), rejected: t(language, 'approvalRejected') }[status] || status;

    const handle = async (action, fn) => {
        setBusy(action); setError('');
        try {
            const updated = await fn();
            onChanged?.(updated);
            setComment('');
        } catch (e) {
            setError(e?.response?.data?.detail || e.message || t(language, 'errorGeneric'));
        } finally {
            setBusy(null);
        }
    };

    const previewPdf = () => handle('preview', async () => {
        const { data: meta } = await orderApi.generateApproval(order.id);
        const filename = (meta?.s3_key || '').split('/').pop() || `approval-${order.id}.pdf`;
        const { data: blob } = await orderApi.downloadApproval(order.id, filename);
        downloadBlob(blob, filename);
        return { ...order, approvalPdfKey: meta.s3_key };
    });

    const approve = () => handle('approve', async () => {
        const { data } = await orderApi.approve(order.id, comment || null);
        return data;
    });

    const reject = () => handle('reject', async () => {
        const { data } = await orderApi.reject(order.id, comment || null);
        return data;
    });

    const dealerConfirm = () => handle('confirm', async () => {
        const { data } = await orderApi.dealerConfirm(order.id, comment || null);
        return data;
    });

    const uploadSigned = () => handle('signed', async () => {
        if (!signedFile) throw new Error(t(language, 'approvalSignedFileRequired'));
        const { data } = await orderApi.uploadSignedApproval(order.id, signedFile);
        setSignedFile(null);
        return data;
    });

    const selectQuote = (quoteId) => handle(`quote-${quoteId}`, async () => {
        const { data } = await orderApi.selectQuote(order.id, quoteId);
        return data;
    });

    const isClient = role === 'client';
    const isDealer = role === 'dealer' || role === 'admin';
    const canDecide = isClient && status === 'pending';
    const canUploadSigned = isClient && status === 'approved' && !signedApprovalFileKey;
    const canSelectQuote = isClient && quotes.length > 0 && !selectedQuoteId;
    const canConfirm = isDealer && status === 'approved' && !dealerConfirmedAt;

    return (
        <div className="bg-white/[0.03] border border-white/10 rounded-[14px] p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t(language, 'approvalTitle')}</p>
                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${badgeCls}`}>
                    {badgeText}
                </span>
            </div>

            <div className="flex flex-wrap gap-2">
                <button
                    onClick={previewPdf}
                    disabled={busy === 'preview'}
                    className="px-3 py-2 rounded-[10px] bg-white/10 hover:bg-white/15 text-xs font-bold transition disabled:opacity-50"
                >
                    {busy === 'preview' ? t(language, 'approvalGenerating') : t(language, 'approvalDownloadPdf')}
                </button>

                {canDecide && (
                    <>
                        <button
                            onClick={approve}
                            disabled={busy === 'approve'}
                            className="px-3 py-2 rounded-[10px] bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold transition disabled:opacity-50"
                        >
                            {busy === 'approve' ? '…' : t(language, 'approvalConfirmBtn')}
                        </button>
                        <button
                            onClick={reject}
                            disabled={busy === 'reject'}
                            className="px-3 py-2 rounded-[10px] bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 text-xs font-bold transition disabled:opacity-50"
                        >
                            {busy === 'reject' ? '…' : t(language, 'approvalRejectBtn')}
                        </button>
                    </>
                )}

                {canConfirm && (
                    <button
                        onClick={dealerConfirm}
                        disabled={busy === 'confirm'}
                        className="px-3 py-2 rounded-[10px] bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 text-xs font-bold transition disabled:opacity-50"
                    >
                        {busy === 'confirm' ? '…' : t(language, 'approvalToProduction')}
                    </button>
                )}
            </div>

            {(canDecide || canConfirm) && (
                <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder={t(language, 'approvalCommentPlaceholder')}
                    rows={2}
                    maxLength={1000}
                    className="w-full bg-white/5 border border-white/10 rounded-[10px] px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-white/30 resize-none"
                />
            )}

            {canUploadSigned && (
                <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t(language, 'approvalSignedUploadTitle')}</p>
                    <div className="flex flex-wrap gap-2">
                        <input
                            type="file"
                            accept="application/pdf,image/png,image/jpeg"
                            onChange={(e) => setSignedFile(e.target.files?.[0] || null)}
                            className="min-w-0 flex-1 text-xs text-gray-400 file:mr-3 file:rounded-[10px] file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white hover:file:bg-white/15"
                        />
                        <button
                            onClick={uploadSigned}
                            disabled={!signedFile || busy === 'signed'}
                            className="px-3 py-2 rounded-[10px] bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 text-xs font-bold transition disabled:opacity-50"
                        >
                            {busy === 'signed' ? '…' : t(language, 'approvalUploadSignedBtn')}
                        </button>
                    </div>
                    <p className="text-[10px] text-gray-500">{t(language, 'approvalSignedUploadHint')}</p>
                </div>
            )}

            {signedApprovalFileKey && (
                <a
                    href={signedApprovalFileKey}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-indigo-300 hover:text-indigo-200 font-bold uppercase tracking-widest"
                >
                    {t(language, 'approvalSignedUploaded')}
                </a>
            )}

            {quotes.length > 0 && (
                <div className="border-t border-white/10 pt-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">{t(language, 'quotesTitle')}</p>
                    <div className="grid gap-2">
                        {quotes
                            .slice()
                            .sort((a, b) => (a.price ?? 0) - (b.price ?? 0) || (a.production_days ?? 0) - (b.production_days ?? 0))
                            .map((quote) => {
                                const isSelected = selectedQuoteId === quote.id;
                                return (
                                    <div key={quote.id} className={`rounded-[10px] border p-3 flex flex-col sm:flex-row sm:items-center gap-2 ${isSelected ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/5 border-white/10'}`}>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-white truncate">{quote.manufacturer_name || t(language, 'manufacturerFallback')}</p>
                                            <p className="text-[11px] text-gray-400 mt-0.5">
                                                <span className="font-bold text-white">{quote.price} {quote.currency || 'BYN'}</span>
                                                <span className="mx-2 text-gray-600">·</span>
                                                {quoteTime(quote.production_days, language)}
                                            </p>
                                            {quote.comment && <p className="text-[10px] text-gray-500 mt-1 line-clamp-2">{quote.comment}</p>}
                                        </div>
                                        {canSelectQuote && (
                                            <button
                                                onClick={() => selectQuote(quote.id)}
                                                disabled={busy === `quote-${quote.id}`}
                                                className="px-3 py-2 rounded-[10px] bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold transition disabled:opacity-50"
                                            >
                                                {busy === `quote-${quote.id}` ? '…' : t(language, 'quoteSelectBtn')}
                                            </button>
                                        )}
                                        {isSelected && <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">{t(language, 'quoteSelected')}</span>}
                                    </div>
                                );
                            })}
                    </div>
                </div>
            )}

            {error && <p className="text-xs text-red-400">{error}</p>}
            {dealerConfirmedAt && (
                <p className="text-[10px] text-gray-500">{t(language, 'approvalSentToProduction')} {new Date(dealerConfirmedAt).toLocaleString()}</p>
            )}
        </div>
    );
}
