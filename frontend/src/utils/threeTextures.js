import { useEffect } from 'react';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';

export function configureLogoTexture(texture) {
    if (!texture) return texture;

    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 16;
    texture.needsUpdate = true;

    return texture;
}

export function useLogoTexture(src) {
    const texture = useTexture(src);

    useEffect(() => {
        configureLogoTexture(texture);
    }, [texture]);

    return texture;
}
