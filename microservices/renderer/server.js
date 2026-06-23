import crypto from 'node:crypto';
import express from 'express';
import puppeteer from 'puppeteer';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '50mb' }));

const PORT = Number(process.env.PORT || 3000);
const MAX_SESSIONS = Math.max(1, Number(process.env.CLOUD_RENDER_MAX_SESSIONS || 6));
const SESSION_TTL_MS = Math.max(30_000, Number(process.env.CLOUD_RENDER_SESSION_TTL_MS || 300_000));
const STREAM_FPS = Math.min(30, Math.max(4, Number(process.env.CLOUD_RENDER_FPS || 15)));
const JPEG_QUALITY = Math.min(92, Math.max(35, Number(process.env.CLOUD_RENDER_JPEG_QUALITY || 72)));
const MAX_VIEWPORT_WIDTH = Math.max(640, Number(process.env.CLOUD_RENDER_MAX_WIDTH || 1600));
const MAX_VIEWPORT_HEIGHT = Math.max(480, Number(process.env.CLOUD_RENDER_MAX_HEIGHT || 1000));
const gpuMode = (process.env.RENDER_GPU_MODE || 'auto').toLowerCase();

let browser;
let ready = false;
const sessions = new Map();
const posterCache = new Map();
const posterJobs = new Map();
const posterQueue = [];
let activePosterRenders = 0;
const POSTER_CONCURRENCY = Math.max(1, Number(process.env.CLOUD_POSTER_CONCURRENCY || 2));

const POSTER_CONFIGS = {
    notebook: {
        activeProduct: 'notebook',
        bindingType: 'spiral',
        coverColor: '#1565C0',
        innerCoverColor: '#1565C0',
        spiralColor: '#C0C0C0',
        hasElastic: true,
        hasCorners: false,
        zoomLevel: 1.12,
    },
    thermos: { activeProduct: 'thermos', zoomLevel: 1.7 },
    powerbank: { activeProduct: 'powerbank', zoomLevel: 2.2 },
    sticker: { activeProduct: 'sticker', stickerSheetColor: '#FDD835', zoomLevel: 1.45 },
    shopper: { activeProduct: 'shopper', zoomLevel: 1.55 },
    tshirt: { activeProduct: 'tshirt', zoomLevel: 1.55 },
    hoodie: { activeProduct: 'hoodie', zoomLevel: 1.55 },
    lanyard: { activeProduct: 'lanyard', lanyardColor: '#1565C0', zoomLevel: 1.55 },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || min));

function withPosterSlot(task) {
    return new Promise((resolve, reject) => {
        const run = async () => {
            activePosterRenders += 1;
            try {
                resolve(await task());
            } catch (error) {
                reject(error);
            } finally {
                activePosterRenders -= 1;
                posterQueue.shift()?.();
            }
        };
        if (activePosterRenders < POSTER_CONCURRENCY) void run();
        else posterQueue.push(run);
    });
}

function renderFrontendUrl() {
    const host = process.env.RENDER_FRONTEND_HOST || 'frontend-render';
    const port = process.env.RENDER_FRONTEND_PORT || '80';
    const configuredPath = process.env.RENDER_FRONTEND_PATH || '/render/';
    const path = configuredPath.startsWith('/') ? configuredPath : `/${configuredPath}`;
    return `http://${host}:${port}${path}`;
}

function browserArgs() {
    const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--hide-scrollbars',
        '--mute-audio',
    ];

    if (gpuMode === 'off' || gpuMode === 'software') {
        // Chrome 137+ requires the explicit opt-in for software WebGL.
        args.push('--use-gl=swiftshader', '--enable-unsafe-swiftshader');
    } else if (gpuMode === 'gpu') {
        args.push('--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl');
    } else {
        // Let Chromium select the available backend. This keeps the base compose
        // usable on CPU-only hosts while the GPU override explicitly selects GL.
        args.push('--enable-gpu', '--ignore-gpu-blocklist');
    }
    return args;
}

function normalizeViewport(body = {}) {
    const requestedWidth = Math.max(320, Number(body.width) || 1280);
    const requestedHeight = Math.max(280, Number(body.height) || 720);
    const scale = Math.min(
        1,
        MAX_VIEWPORT_WIDTH / requestedWidth,
        MAX_VIEWPORT_HEIGHT / requestedHeight,
    );
    return {
        width: Math.round(requestedWidth * scale),
        height: Math.round(requestedHeight * scale),
    };
}

async function createRenderPage(config, viewport, { waitForReady = true } = {}) {
    const page = await browser.newPage();
    page.on('pageerror', (error) => console.error('Render page error:', error));
    page.on('console', (message) => {
        if (message.type() === 'error' || message.type() === 'warning') {
            console.error(`Render page ${message.type()}:`, message.text());
        }
    });
    page.on('requestfailed', (request) => {
        console.error('Render page request failed:', request.url(), request.failure()?.errorText || 'unknown');
    });
    await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument((initialConfig) => {
        window.__INITIAL_RENDER_CONFIG__ = initialConfig;
    }, config || {});
    await page.goto(`${renderFrontendUrl()}?render_mode=true&stream_mode=true`, {
        waitUntil: 'domcontentloaded',
        timeout: Number(process.env.RENDER_PAGE_TIMEOUT_MS || 20_000),
    });
    await page.waitForFunction('typeof window.__APPLY_RENDER_CONFIG__ === "function"', {
        timeout: Number(process.env.RENDER_PAGE_TIMEOUT_MS || 20_000),
    });
    if (waitForReady) {
        await page.waitForFunction('window.__3D_READY__ === true', {
            timeout: Number(process.env.RENDER_PAGE_TIMEOUT_MS || 20_000),
        });
    }
    return page;
}

async function closeSession(session) {
    if (!session || session.closed) return;
    session.closed = true;
    sessions.delete(session.id);
    for (const client of session.clients) {
        if (!client.res.writableEnded) client.res.end();
    }
    session.clients.clear();
    try {
        await session.page.close();
    } catch {
        // Page may already be gone after a browser restart.
    }
}

function touchSession(session) {
    session.lastActivityAt = Date.now();
}

function enqueueSessionCommand(session, command) {
    const queued = session.commandQueue.catch(() => {}).then(command);
    session.commandQueue = queued;
    return queued;
}

async function streamFrames(session) {
    const frameInterval = 1000 / STREAM_FPS;
    while (!session.closed) {
        if (session.clients.size === 0) {
            await sleep(200);
            continue;
        }

        const startedAt = Date.now();
        try {
            const frame = await session.page.screenshot({
                type: 'jpeg',
                quality: JPEG_QUALITY,
                captureBeyondViewport: false,
            });
            session.latestFrame = frame;
            touchSession(session);

            for (const client of [...session.clients]) {
                if (client.res.writableEnded || client.res.destroyed) {
                    session.clients.delete(client);
                    continue;
                }
                if (client.blocked) continue;
                const header = Buffer.from(
                    `--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`,
                );
                const headerOk = client.res.write(header);
                const frameOk = client.res.write(frame);
                const boundaryOk = client.res.write('\r\n');
                if (!headerOk || !frameOk || !boundaryOk) {
                    client.blocked = true;
                    client.res.once('drain', () => { client.blocked = false; });
                }
            }
        } catch (error) {
            console.error(`Cloud render session ${session.id} failed:`, error);
            await closeSession(session);
            break;
        }

        await sleep(Math.max(0, frameInterval - (Date.now() - startedAt)));
    }
}

app.get('/healthz', (_req, res) => {
    if (ready && browser) {
        res.status(200).json({
            status: 'ok',
            mode: gpuMode,
            sessions: sessions.size,
            maxSessions: MAX_SESSIONS,
            fps: STREAM_FPS,
        });
    } else {
        res.status(503).send('starting');
    }
});

// One-shot high resolution render used by order previews.
app.post('/render', async (req, res) => {
    let page;
    try {
        page = await createRenderPage(req.body?.config || {}, { width: 1024, height: 1024 });
        await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 2 });
        const imageBuffer = await page.screenshot({ type: 'png', omitBackground: false });
        res.setHeader('Content-Type', 'image/png');
        res.send(imageBuffer);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: String(error) });
    } finally {
        if (page) await page.close().catch(() => {});
    }
});

// Create a cloud-gaming-like browser session. The model and Three.js stay in
// this container; the user's browser only decodes JPEG frames.
app.post('/cloud/session', async (req, res) => {
    if (!ready || !browser) return res.status(503).json({ error: 'renderer_starting' });
    if (sessions.size >= MAX_SESSIONS) return res.status(503).json({ error: 'renderer_busy' });

    const id = crypto.randomUUID();
    const viewport = normalizeViewport(req.body);
    let page;
    try {
        // Do not block session creation on every GLB. The stream can start with
        // the scene loader visible and naturally reveal the model when ready.
        page = await createRenderPage(req.body?.config || {}, viewport, { waitForReady: false });
        const session = {
            id,
            page,
            viewport,
            clients: new Set(),
            latestFrame: null,
            lastActivityAt: Date.now(),
            closed: false,
            commandQueue: Promise.resolve(),
        };
        sessions.set(id, session);
        void streamFrames(session);
        res.status(201).json({
            id,
            width: viewport.width,
            height: viewport.height,
            fps: STREAM_FPS,
            codec: 'mjpeg',
        });
    } catch (error) {
        if (page) await page.close().catch(() => {});
        console.error('Unable to create cloud render session:', error);
        res.status(503).json({ error: 'session_start_failed' });
    }
});

app.get('/cloud/session/:id/stream', (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session || session.closed) return res.status(404).end();
    touchSession(session);

    res.status(200);
    res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=frame');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    const client = { res, blocked: false };
    session.clients.add(client);

    req.on('close', () => session.clients.delete(client));
});

app.post('/cloud/session/:id/config', async (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session || session.closed) return res.status(404).json({ error: 'session_not_found' });
    touchSession(session);
    try {
        await enqueueSessionCommand(session, () => (
            session.page.evaluate((config) => window.__APPLY_RENDER_CONFIG__?.(config), req.body?.config || {})
        ));
        res.status(204).end();
    } catch (error) {
        console.error(`Config update failed for ${session.id}:`, error);
        res.status(409).json({ error: 'config_update_failed' });
    }
});

app.post('/cloud/session/:id/input', async (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session || session.closed) return res.status(404).json({ error: 'session_not_found' });
    touchSession(session);

    const type = String(req.body?.type || '');
    const x = clamp(req.body?.x, 0, 1) * session.viewport.width;
    const y = clamp(req.body?.y, 0, 1) * session.viewport.height;
    try {
        if (!['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel'].includes(type)) {
            return res.status(400).json({ error: 'unsupported_input' });
        }
        await enqueueSessionCommand(session, async () => {
            if (type === 'pointerdown') {
                await session.page.mouse.move(x, y);
                await session.page.mouse.down({ button: 'left' });
            } else if (type === 'pointermove') {
                await session.page.mouse.move(x, y);
            } else if (type === 'pointerup' || type === 'pointercancel') {
                await session.page.mouse.move(x, y);
                await session.page.mouse.up({ button: 'left' });
            } else if (type === 'wheel') {
                await session.page.mouse.move(x, y);
                await session.page.mouse.wheel({ deltaY: clamp(req.body?.deltaY, -1200, 1200) });
            }
        });
        res.status(204).end();
    } catch (error) {
        console.error(`Input failed for ${session.id}:`, error);
        res.status(409).json({ error: 'input_failed' });
    }
});

app.delete('/cloud/session/:id', async (req, res) => {
    const session = sessions.get(req.params.id);
    if (session) await closeSession(session);
    res.status(204).end();
});

async function renderPoster(product) {
    if (posterCache.has(product)) return posterCache.get(product);
    if (posterJobs.has(product)) return posterJobs.get(product);

    const job = withPosterSlot(async () => {
        let page;
        try {
            page = await createRenderPage(POSTER_CONFIGS[product], { width: 640, height: 420 });
            // Let damping and material/texture updates settle before freezing the card.
            await sleep(180);
            const image = await page.screenshot({
                type: 'jpeg',
                quality: 82,
                captureBeyondViewport: false,
            });
            posterCache.set(product, image);
            return image;
        } finally {
            if (page) await page.close().catch(() => {});
        }
    }).finally(() => posterJobs.delete(product));

    posterJobs.set(product, job);
    return job;
}

app.get('/cloud/poster/:product.jpg', async (req, res) => {
    const product = req.params.product;
    if (!Object.hasOwn(POSTER_CONFIGS, product)) return res.status(404).end();
    try {
        const image = await renderPoster(product);
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
        res.send(image);
    } catch (error) {
        console.error(`Poster render failed for ${product}:`, error);
        res.status(503).end();
    }
});

setInterval(() => {
    const expiredBefore = Date.now() - SESSION_TTL_MS;
    for (const session of sessions.values()) {
        if (session.lastActivityAt < expiredBefore) void closeSession(session);
    }
}, 15_000).unref();

async function init() {
    browser = await puppeteer.launch({
        headless: 'new',
        args: browserArgs(),
    });
    browser.on('disconnected', () => {
        ready = false;
        for (const session of sessions.values()) void closeSession(session);
    });
    ready = true;
    app.listen(PORT, () => {
        console.log(`Renderer ready on :${PORT} (${gpuMode}, ${STREAM_FPS} fps).`);
        if (process.env.CLOUD_PREWARM_POSTERS !== 'false') {
            for (const product of Object.keys(POSTER_CONFIGS)) {
                void renderPoster(product).catch((error) => {
                    console.error(`Poster prewarm failed for ${product}:`, error);
                });
            }
        }
    });
}

init().catch((error) => {
    console.error('Renderer failed to start:', error);
    process.exitCode = 1;
});
