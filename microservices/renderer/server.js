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
            '--use-gl=swiftshader',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
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

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 2 });

        await page.goto(url, { waitUntil: 'domcontentloaded' });

        await page.waitForFunction('window.__3D_READY__ === true', { timeout: 15000 });

        const imageBuffer = await page.screenshot({ type: 'png', omitBackground: false });
        await page.close();

        res.setHeader('Content-Type', 'image/png');
        res.send(imageBuffer);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: String(e) });
    }
});

init().then(() => app.listen(3000));
