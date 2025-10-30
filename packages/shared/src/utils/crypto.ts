import { encode, decode } from '@msgpack/msgpack';

type PackedPrimitive = string | number | boolean | null | undefined;

type PackedBlob = { __type: 'blob'; mime: string; bytes: Uint8Array };

type PackedValue = PackedPrimitive | PackedBlob | PackedValue[] | { [key: string]: PackedValue };

export async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
    return new Uint8Array(await blob.arrayBuffer());
}

export function uint8ArrayToBlob(uint8Buffer: Uint8Array): Blob {
    return new Blob([toArrayBuffer(uint8Buffer)], {
        type: 'application/octet-stream',
    });
}

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
    const buffer = new ArrayBuffer(view.byteLength);
    new Uint8Array(buffer).set(view);
    return buffer;
}

export async function encrypt<T>(password: string, data: T): Promise<Blob> {
    const preparedData = await prepareForPacking(data);

    const packed = encode(preparedData);

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );

    const key = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt,
            iterations: 100000,
            hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt']
    );

    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        toArrayBuffer(packed)
    );

    const combined = new Uint8Array([...salt, ...iv, ...new Uint8Array(ciphertext)]);

    return uint8ArrayToBlob(combined);
}

export async function decrypt<T>(password: string, encryptedData: Blob): Promise<T> {
    const combined = await blobToUint8Array(encryptedData);

    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const ciphertext = combined.slice(28);

    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );

    const key = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt,
            iterations: 100000,
            hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        true,
        ['decrypt']
    );

    try {
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);

        const unpacked = decode(new Uint8Array(decrypted)) as PackedValue;
        return restoreFromPacking(unpacked) as T;
    } catch {
        throw new Error('Decryption failed: Incorrect password or corrupted data');
    }
}

async function prepareForPacking(data: unknown): Promise<PackedValue> {
    if (data instanceof Blob) {
        return {
            __type: 'blob',
            mime: data.type,
            bytes: await blobToUint8Array(data),
        };
    }
    if (Array.isArray(data)) {
        return Promise.all(data.map((item) => prepareForPacking(item)));
    }
    if (typeof data === 'object' && data !== null) {
        const entries = await Promise.all(
            Object.entries(data as Record<string, unknown>).map(async ([key, value]) => [
                key,
                await prepareForPacking(value),
            ])
        );
        return Object.fromEntries(entries) as Record<string, PackedValue>;
    }
    return data as PackedPrimitive;
}

function restoreFromPacking(data: PackedValue): unknown {
    if (data && typeof data === 'object') {
        if ('__type' in data && (data as PackedBlob).__type === 'blob') {
            const blobLike = data as PackedBlob;
            return new Blob([toArrayBuffer(blobLike.bytes)], {
                type: blobLike.mime,
            });
        }
        if (Array.isArray(data)) {
            return data.map(restoreFromPacking);
        }
        return Object.fromEntries(
            Object.entries(data).map(([key, value]) => [
                key,
                restoreFromPacking(value as PackedValue),
            ])
        );
    }
    return data;
}
