import { useOrderQr } from '../../utils/useOrderQr';

export const OrderQrTile = ({ orderId, className = 'w-20 h-20 rounded-[6px] bg-white p-1' }) => {
    const src = useOrderQr(orderId);
    if (!src) return <div className={className.replace('bg-white p-1', 'bg-white/10')} />;
    return <img src={src} alt="QR" className={className} />;
};
