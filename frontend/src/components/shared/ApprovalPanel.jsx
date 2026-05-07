import { useState } from 'react';
import { orderApi } from '../../api';
import { downloadBlob } from '../../utils/download';

const STATUS_BADGE = {
    pending:  { text: 'Ожидает согласования', cls: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
    approved: { text: 'Согласовано клиентом', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
    rejected: { text: 'Отклонено клиентом',   cls: 'bg-red-500/20 text-red-300 border-red-500/30' },
};

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
    const [busy, setBusy] = useState(null);
    const [comment, setComment] = useState('');
    const [error, setError] = useState('');

    const status = order.approvalStatus || order.approval_status || 'pending';
    const dealerConfirmedAt = order.dealerConfirmedAt || order.dealer_confirmed_at;
    const badge = STATUS_BADGE[status] || STATUS_BADGE.pending;

    const handle = async (action, fn) => {
        setBusy(action); setError('');
        try {
            const updated = await fn();
            onChanged?.(updated);
            setComment('');
        } catch (e) {
            setError(e?.response?.data?.detail || e.message || 'Ошибка');
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

    const isClient = role === 'client';
    const isDealer = role === 'dealer' || role === 'admin';
    const canDecide = isClient && status === 'pending';
    const canConfirm = isDealer && status === 'approved' && !dealerConfirmedAt;

    return (
        <div className="bg-white/[0.03] border border-white/10 rounded-[14px] p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Согласование</p>
                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${badge.cls}`}>
                    {badge.text}
                </span>
            </div>

            <div className="flex flex-wrap gap-2">
                <button
                    onClick={previewPdf}
                    disabled={busy === 'preview'}
                    className="px-3 py-2 rounded-[10px] bg-white/10 hover:bg-white/15 text-xs font-bold transition disabled:opacity-50"
                >
                    {busy === 'preview' ? 'Генерация…' : '⬇ PDF согласования'}
                </button>

                {canDecide && (
                    <>
                        <button
                            onClick={approve}
                            disabled={busy === 'approve'}
                            className="px-3 py-2 rounded-[10px] bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold transition disabled:opacity-50"
                        >
                            {busy === 'approve' ? '…' : '✓ Подтвердить'}
                        </button>
                        <button
                            onClick={reject}
                            disabled={busy === 'reject'}
                            className="px-3 py-2 rounded-[10px] bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 text-xs font-bold transition disabled:opacity-50"
                        >
                            {busy === 'reject' ? '…' : '✗ Отклонить'}
                        </button>
                    </>
                )}

                {canConfirm && (
                    <button
                        onClick={dealerConfirm}
                        disabled={busy === 'confirm'}
                        className="px-3 py-2 rounded-[10px] bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 text-xs font-bold transition disabled:opacity-50"
                    >
                        {busy === 'confirm' ? '…' : '🏭 В производство'}
                    </button>
                )}
            </div>

            {(canDecide || canConfirm) && (
                <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Комментарий (опционально)…"
                    rows={2}
                    maxLength={1000}
                    className="w-full bg-white/5 border border-white/10 rounded-[10px] px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-white/30 resize-none"
                />
            )}

            {error && <p className="text-xs text-red-400">{error}</p>}
            {dealerConfirmedAt && (
                <p className="text-[10px] text-gray-500">Передано в производство {new Date(dealerConfirmedAt).toLocaleString('ru-RU')}</p>
            )}
        </div>
    );
}
