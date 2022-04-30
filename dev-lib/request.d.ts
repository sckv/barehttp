/// <reference types="node" />
import { StatusCodesUnion } from './utils/';
import { CookiesManager } from './middlewares/cookies/cookie-manager';
import type { IncomingMessage, ServerResponse } from 'http';
declare type Cacheability = 'public' | 'private' | 'no-cache' | 'no-store';
declare type ExpirationType = 'max-age' | 's-maxage' | 'max-stale' | 'min-fresh' | 'stale-while-revalidate' | 'stale-if-error';
declare type Revalidation = 'must-revalidate' | 'proxy-revalidate' | 'immutable';
export declare type CacheOpts = {
    cacheability: Cacheability;
    expirationKind: ExpirationType;
    /**
     * Default 3600
     */
    expirationSeconds?: number;
    revalidation?: Revalidation;
};
export declare class BareRequest {
    _originalRequest: IncomingMessage;
    _originalResponse: ServerResponse;
    ID: {
        code: string;
    };
    params: {
        [k: string]: string | undefined;
    };
    query: {
        [k: string]: string | undefined;
    };
    remoteIp?: string;
    requestBody?: any;
    requestHeaders: {
        [key: string]: any;
    };
    statusToSend: number;
    cm?: CookiesManager;
    sent: boolean;
    private cache;
    private startTime?;
    private startDate;
    private remoteClient;
    private logging;
    private requestTimeFormat?;
    private headers;
    private cookies;
    private contentType?;
    private timeout?;
    constructor(_originalRequest: IncomingMessage, _originalResponse: ServerResponse, options?: {
        logging?: boolean;
        requestTimeFormat?: 'ms' | 's';
    });
    private readBody;
    private attachCookieManager;
    private populateCookies;
    private classifyRequestBody;
    private setRemoteClient;
    private setRequestTime;
    private cleanHeader;
    private attachTimeout;
    private setParams;
    getHeader(header: string): string | string[];
    getCookie(cookie: string): string;
    getCookies(): {
        [x: string]: string;
    };
    disableCache(): void;
    setCache(cacheOpts: CacheOpts): void;
    addHeader(header: string, value: string | number | string[] | number[]): void;
    setHeader(header: string, value: string | number | string[] | number[]): void;
    setHeaders(headers: {
        [header: string]: string | number | string[] | number[];
    }): void;
    addHeaders(headers: {
        [header: string]: string | number | string[] | number[];
    }): void;
    status(status: StatusCodesUnion): this;
    sendStatus(status: StatusCodesUnion): void;
    stream<T extends NodeJS.WritableStream>(stream: T): void;
    json(data: any): void;
    _send(chunk?: string | ArrayBuffer | NodeJS.ArrayBufferView | SharedArrayBuffer): void;
    send(anything?: any): void;
}
export {};
