import { useEffect, useState } from 'react';
import { orderApi } from '../api';

export function useOrderQr(orderId) {
    const [src, setSrc] = useState(null);

    useEffect(() => {
        if (!orderId) return undefined;
        let revoked = false;
        let objectUrl = null;
        orderApi.qr(orderId)
            .then(({ data }) => {
                if (revoked) return;
                objectUrl = URL.createObjectURL(data);
                setSrc(objectUrl);
            })
            .catch(() => setSrc(null));
        return () => {
            revoked = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [orderId]);

    return src;
}
