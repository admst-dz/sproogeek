import { useEffect } from 'react';

export function VkOAuthCallback() {
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const message = {
            type: 'spruzhuk:vk-oauth',
            code: params.get('code') || '',
            state: params.get('state') || '',
            error: params.get('error') || '',
        };

        if (window.opener) {
            window.opener.postMessage(message, window.location.origin);
            window.setTimeout(() => window.close(), 120);
        }
    }, []);

    return (
        <div className="min-h-screen bg-[#0B0F19] text-white flex items-center justify-center p-6 font-sans">
            <div className="w-full max-w-sm bg-[#1A1F2E]/80 border border-white/10 rounded-[24px] p-7 text-center shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
                <div className="mx-auto mb-5 w-12 h-12 rounded-[16px] bg-[#0077FF] flex items-center justify-center text-white font-black text-xl">
                    VK
                </div>
                <h1 className="text-xl font-bold mb-2">Завершаем вход</h1>
                <p className="text-sm text-white/55">Это окно можно закрыть после возврата на сайт.</p>
            </div>
        </div>
    );
}
