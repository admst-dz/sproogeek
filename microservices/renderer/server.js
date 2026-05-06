import express from 'express';
import puppeteer from 'puppeteer';

const app = express();
app.use(express.json({ limit: '50mb' }));

let browser;

async function init() {
    browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--enable-webgl',
            '--use-gl=swiftshader',
            '--ignore-gpu-blocklist',
            '--disable-dev-shm-usage',
            '--hide-scrollbars',
            '--window-size=1024,1024'
        ]
    });
    console.log("Renderer ready.");
}

app.post('/render', async (req, res) => {
    const { config } = req.body;

    const configBase64 = Buffer.from(JSON.stringify(config), 'utf8').toString('base64');
    const renderFrontendHost = process.env.RENDER_FRONTEND_HOST || 'frontend-render';
    const renderFrontendPort = process.env.RENDER_FRONTEND_PORT || '80';
    const renderFrontendPath = process.env.RENDER_FRONTEND_PATH || '/render/';
    const normalizedPath = renderFrontendPath.startsWith('/') ? renderFrontendPath : `/${renderFrontendPath}`;
    const url = `http://${renderFrontendHost}:${renderFrontendPort}${normalizedPath}?render_mode=true&config=${configBase64}`;

    let page;
    try {
        page = await browser.newPage();
        await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 2 });
        page.setDefaultTimeout(20000);

        await page.goto(url, { waitUntil: ['domcontentloaded', 'networkidle2'], timeout: 30000 });

        await page.evaluate(async () => {
            if (document.fonts?.ready) await document.fonts.ready;
            const images = Array.from(document.images || []);
            await Promise.all(images.map((img) => (
                img.complete ? Promise.resolve() : new Promise((resolve) => {
                    img.addEventListener('load', resolve, { once: true });
                    img.addEventListener('error', resolve, { once: true });
                })
            )));
        });
        await page.waitForSelector('canvas', { timeout: 15000 });
        await page.waitForFunction('window.__3D_READY__ === true', { timeout: 15000 });
        await page.evaluate(() => new Promise((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }));

        const canvas = await page.$('canvas');
        const imageBuffer = canvas
            ? await canvas.screenshot({ type: 'png', omitBackground: false })
            : await page.screenshot({ type: 'png', omitBackground: false, fullPage: false });

        res.setHeader('Content-Type', 'image/png');
        res.send(imageBuffer);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: String(e) });
    } finally {
        if (page) await page.close().catch(() => {});
    }
});

init().then(() => app.listen(3000));
