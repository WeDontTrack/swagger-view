import * as crypto from 'crypto';

export function generateHash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
}

export function fastHash(str: string): string {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = (hash * 16777619) >>> 0;
    }
    return hash.toString(16);
}