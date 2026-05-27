const EDITOR_MAX_EDGE = 2400;
const EXPORT_QUALITY = 0.96;

export const DEFAULT_BACKGROUND_STRENGTH = 0.56;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const normalizeStrength = (strength) => {
    const value = Number(strength);
    return Number.isFinite(value) ? clamp(value, 0, 1) : DEFAULT_BACKGROUND_STRENGTH;
};

const readAsDataURL = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
});

const loadImage = (src) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
});

const canvasToBlob = (canvas, type = 'image/png', quality = EXPORT_QUALITY) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas export failed'));
    }, type, quality);
});

const colorDistance = (data, offset, color) => {
    const dr = data[offset] - color[0];
    const dg = data[offset + 1] - color[1];
    const db = data[offset + 2] - color[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
};

const thresholdFromStrength = (strength, base = 26, spread = 112) => (
    base + normalizeStrength(strength) * spread
);

const pushSample = (samples, data, index) => {
    const offset = index * 4;
    if (data[offset + 3] < 16) return;
    samples.push([data[offset], data[offset + 1], data[offset + 2]]);
};

const buildEdgeSamples = (data, width, height) => {
    const samples = [];
    const stride = Math.max(1, Math.floor(Math.min(width, height) / 120));
    for (let x = 0; x < width; x += stride) {
        pushSample(samples, data, x);
        pushSample(samples, data, (height - 1) * width + x);
    }
    for (let y = 0; y < height; y += stride) {
        pushSample(samples, data, y * width);
        pushSample(samples, data, y * width + width - 1);
    }
    pushSample(samples, data, 0);
    pushSample(samples, data, width - 1);
    pushSample(samples, data, (height - 1) * width);
    pushSample(samples, data, height * width - 1);
    return samples;
};

const clusterEdgePalette = (samples) => {
    const clusters = [];
    const mergeDistance = 34;

    for (const sample of samples) {
        let nearest = null;
        let nearestDistance = Infinity;
        for (const cluster of clusters) {
            const dr = sample[0] - cluster.r;
            const dg = sample[1] - cluster.g;
            const db = sample[2] - cluster.b;
            const distance = Math.sqrt(dr * dr + dg * dg + db * db);
            if (distance < nearestDistance) {
                nearest = cluster;
                nearestDistance = distance;
            }
        }

        if (nearest && nearestDistance <= mergeDistance) {
            nearest.count += 1;
            nearest.r += (sample[0] - nearest.r) / nearest.count;
            nearest.g += (sample[1] - nearest.g) / nearest.count;
            nearest.b += (sample[2] - nearest.b) / nearest.count;
        } else {
            clusters.push({ r: sample[0], g: sample[1], b: sample[2], count: 1 });
        }
    }

    return clusters
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
        .map((cluster) => [cluster.r, cluster.g, cluster.b]);
};

const isPaletteMatch = (data, index, palette, threshold) => {
    const offset = index * 4;
    if (data[offset + 3] < 16) return true;
    for (const color of palette) {
        if (colorDistance(data, offset, color) <= threshold) return true;
    }
    return false;
};

const createQueue = (size) => {
    try {
        return new Uint32Array(size);
    } catch {
        return [];
    }
};

const enqueue = (queue, tail, value) => {
    queue[tail] = value;
    return tail + 1;
};

const addSeedIfBackground = ({ data, width, height, visited, mask, queue, tail, index, palette, threshold }) => {
    if (index < 0 || index >= width * height || visited[index]) return tail;
    visited[index] = 1;
    if (!isPaletteMatch(data, index, palette, threshold)) return tail;
    mask[index] = 255;
    return enqueue(queue, tail, index);
};

const softenMaskEdges = (mask, width, height) => {
    const next = mask.slice();
    for (let y = 1; y < height - 1; y += 1) {
        const row = y * width;
        for (let x = 1; x < width - 1; x += 1) {
            const index = row + x;
            if (mask[index] === 255) continue;
            let removedNeighbors = 0;
            removedNeighbors += mask[index - 1] > 0 ? 1 : 0;
            removedNeighbors += mask[index + 1] > 0 ? 1 : 0;
            removedNeighbors += mask[index - width] > 0 ? 1 : 0;
            removedNeighbors += mask[index + width] > 0 ? 1 : 0;
            if (removedNeighbors >= 3) next[index] = 180;
            else if (removedNeighbors === 2) next[index] = 96;
            else if (removedNeighbors === 1) next[index] = Math.max(next[index], 42);
        }
    }
    return next;
};

const blurMask = (mask, width, height) => {
    const next = new Uint8ClampedArray(mask.length);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            let sum = 0;
            let count = 0;
            for (let dy = -1; dy <= 1; dy += 1) {
                const yy = y + dy;
                if (yy < 0 || yy >= height) continue;
                for (let dx = -1; dx <= 1; dx += 1) {
                    const xx = x + dx;
                    if (xx < 0 || xx >= width) continue;
                    sum += mask[yy * width + xx];
                    count += 1;
                }
            }
            next[y * width + x] = sum / count;
        }
    }
    return next;
};

export async function loadLogoImageData(file, maxEdge = EDITOR_MAX_EDGE) {
    const source = await readAsDataURL(file);
    const image = await loadImage(source);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) {
        throw new Error('Invalid image');
    }

    const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', { alpha: true, colorSpace: 'srgb' });
    if (!ctx) throw new Error('Canvas is not available');
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, width, height);

    return ctx.getImageData(0, 0, width, height);
}

export function createAutoBackgroundMask(imageData, strength = DEFAULT_BACKGROUND_STRENGTH) {
    const { data, width, height } = imageData;
    const total = width * height;
    const mask = new Uint8ClampedArray(total);
    const visited = new Uint8Array(total);
    const samples = buildEdgeSamples(data, width, height);
    const palette = clusterEdgePalette(samples);
    if (!palette.length) return mask;

    const threshold = thresholdFromStrength(strength);
    const queue = createQueue(total);
    let head = 0;
    let tail = 0;

    for (let x = 0; x < width; x += 1) {
        tail = addSeedIfBackground({ data, width, height, visited, mask, queue, tail, index: x, palette, threshold });
        tail = addSeedIfBackground({ data, width, height, visited, mask, queue, tail, index: (height - 1) * width + x, palette, threshold });
    }
    for (let y = 0; y < height; y += 1) {
        tail = addSeedIfBackground({ data, width, height, visited, mask, queue, tail, index: y * width, palette, threshold });
        tail = addSeedIfBackground({ data, width, height, visited, mask, queue, tail, index: y * width + width - 1, palette, threshold });
    }

    while (head < tail) {
        const index = queue[head];
        head += 1;
        const x = index % width;
        const y = Math.floor(index / width);
        if (x > 0) {
            tail = addSeedIfBackground({ data, width, height, visited, mask, queue, tail, index: index - 1, palette, threshold });
        }
        if (x < width - 1) {
            tail = addSeedIfBackground({ data, width, height, visited, mask, queue, tail, index: index + 1, palette, threshold });
        }
        if (y > 0) {
            tail = addSeedIfBackground({ data, width, height, visited, mask, queue, tail, index: index - width, palette, threshold });
        }
        if (y < height - 1) {
            tail = addSeedIfBackground({ data, width, height, visited, mask, queue, tail, index: index + width, palette, threshold });
        }
    }

    return softenMaskEdges(mask, width, height);
}

export function addBackgroundSeedToMask(imageData, sourceMask, x, y, strength = DEFAULT_BACKGROUND_STRENGTH) {
    const { data, width, height } = imageData;
    const seedX = clamp(Math.round(x), 0, width - 1);
    const seedY = clamp(Math.round(y), 0, height - 1);
    const seedIndex = seedY * width + seedX;
    const seedOffset = seedIndex * 4;
    const seedColor = [data[seedOffset], data[seedOffset + 1], data[seedOffset + 2]];
    const threshold = thresholdFromStrength(strength, 18, 104);
    const total = width * height;
    const mask = sourceMask.slice();
    const visited = new Uint8Array(total);
    const queue = createQueue(total);
    let head = 0;
    let tail = 0;

    const add = (index) => {
        if (index < 0 || index >= total || visited[index]) return;
        visited[index] = 1;
        const offset = index * 4;
        if (data[offset + 3] >= 16 && colorDistance(data, offset, seedColor) > threshold) return;
        mask[index] = 255;
        tail = enqueue(queue, tail, index);
    };

    add(seedIndex);
    while (head < tail) {
        const index = queue[head];
        head += 1;
        const px = index % width;
        const py = Math.floor(index / width);
        if (px > 0) add(index - 1);
        if (px < width - 1) add(index + 1);
        if (py > 0) add(index - width);
        if (py < height - 1) add(index + width);
    }

    return softenMaskEdges(mask, width, height);
}

export function paintBackgroundMask(sourceMask, width, height, x, y, radius, remove = true) {
    const mask = sourceMask.slice();
    const cx = clamp(Math.round(x), 0, width - 1);
    const cy = clamp(Math.round(y), 0, height - 1);
    const r = Math.max(2, Math.round(radius));
    const r2 = r * r;
    const value = remove ? 255 : 0;
    const minX = Math.max(0, cx - r);
    const maxX = Math.min(width - 1, cx + r);
    const minY = Math.max(0, cy - r);
    const maxY = Math.min(height - 1, cy + r);

    for (let yy = minY; yy <= maxY; yy += 1) {
        for (let xx = minX; xx <= maxX; xx += 1) {
            const dx = xx - cx;
            const dy = yy - cy;
            if (dx * dx + dy * dy <= r2) {
                mask[yy * width + xx] = value;
            }
        }
    }
    return mask;
}

export function renderMaskedImageData(imageData, mask, { feather = true } = {}) {
    const { data, width, height } = imageData;
    const output = new ImageData(new Uint8ClampedArray(data), width, height);
    const softMask = feather ? blurMask(mask, width, height) : mask;

    for (let index = 0; index < softMask.length; index += 1) {
        const offset = index * 4;
        const keepAlpha = 1 - (softMask[index] / 255);
        output.data[offset + 3] = Math.round(output.data[offset + 3] * keepAlpha);
        if (output.data[offset + 3] < 2) {
            output.data[offset + 3] = 0;
        }
    }
    return output;
}

export function drawMaskedPreview(canvas, imageData, mask) {
    if (!canvas || !imageData || !mask) return;
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d', { alpha: true, colorSpace: 'srgb' });
    if (!ctx) return;
    ctx.clearRect(0, 0, imageData.width, imageData.height);
    ctx.putImageData(renderMaskedImageData(imageData, mask), 0, 0);
}

export async function exportBackgroundRemovedFile(file, imageData, mask) {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d', { alpha: true, colorSpace: 'srgb' });
    if (!ctx) throw new Error('Canvas is not available');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.putImageData(renderMaskedImageData(imageData, mask), 0, 0);

    const blob = await canvasToBlob(canvas, 'image/png', EXPORT_QUALITY);
    const baseName = (file?.name || 'logo').replace(/\.[^.]+$/, '') || 'logo';
    return new File([blob], `${baseName}-no-bg.png`, { type: 'image/png' });
}

export async function removeLogoBackgroundAutomatically(file, strength = DEFAULT_BACKGROUND_STRENGTH) {
    const imageData = await loadLogoImageData(file);
    const mask = createAutoBackgroundMask(imageData, strength);
    return exportBackgroundRemovedFile(file, imageData, mask);
}
