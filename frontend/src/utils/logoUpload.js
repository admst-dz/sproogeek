export const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp';
export const LOGO_MAX_BYTES = 10_000_000;

const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const ACCEPTED_EXTENSIONS = /\.(png|jpe?g|webp)$/i;

export const isSupportedLogoFile = (file) => {
    if (!file) return false;
    return ACCEPTED_TYPES.has(file.type) || ACCEPTED_EXTENSIONS.test(file.name || '');
};

export const isLogoFileTooLarge = (file) => Boolean(file && file.size > LOGO_MAX_BYTES);
