import {customAlphabet} from 'nanoid'

export function generateSessionId():string{
    const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 12);
    return nanoid();
}

export function getSessionExpiration():Date{
    const expiration = new Date();
    expiration.setHours(expiration.getHours() + 24);
    return expiration;
}

export function isSessionExpired(expiresAt:Date):boolean{
    const now = new Date();
    return now > expiresAt;
}

export function buildCollabUrl(sessionId:string,baseUrl?:string):string{
    const base = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
    return `${base}/collab/${sessionId}`;
}

