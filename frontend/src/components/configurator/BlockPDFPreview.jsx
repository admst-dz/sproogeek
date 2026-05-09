import { useEffect, useRef, useState } from 'react';
import { useConfigurator } from '../../store';
import { t } from '../../i18n';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const PATTERN_PDF = {
    lined:  '/pdfs/Polosi.pdf',
    tlined: '/pdfs/Tpolosi.pdf',
    grid:   '/pdfs/Kletka.pdf',
    dotted: '/pdfs/Tochki.pdf',
};

export function BlockPDFPreview({ pattern }) {
    const canvasRef = useRef(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const { language } = useConfigurator();

    useEffect(() => {
        const pdfUrl = PATTERN_PDF[pattern];
        if (!pdfUrl) return;

        let cancelled = false;
        setLoading(true);
        setError(false);

        (async () => {
            try {
                const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
                if (cancelled) return;
                const page = await pdf.getPage(1);
                if (cancelled) return;

                const canvas = canvasRef.current;
                if (!canvas) return;

                const container = canvas.parentElement;
                const containerWidth = container?.clientWidth || 320;

                const viewport = page.getViewport({ scale: 1 });
                const scale = containerWidth / viewport.width;
                const scaledViewport = page.getViewport({ scale });

                canvas.width = scaledViewport.width;
                canvas.height = scaledViewport.height;

                await page.render({
                    canvasContext: canvas.getContext('2d'),
                    viewport: scaledViewport,
                }).promise;

                setLoading(false);
            } catch {
                if (!cancelled) { setLoading(false); setError(true); }
            }
        })();

        return () => { cancelled = true; };
    }, [pattern]);

    if (!PATTERN_PDF[pattern]) return null;

    return (
        <div className="relative w-full rounded-[11px] overflow-hidden bg-white shadow-lg" style={{ minHeight: 180 }}>
            {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                    <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                </div>
            )}
            {error && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
                    {t(language, 'previewUnavailable')}
                </div>
            )}
            <canvas ref={canvasRef} className="w-full block" />
        </div>
    );
}
