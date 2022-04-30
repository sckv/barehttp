import cookie from 'cookie';
import { secretsOperator } from './signer';
import type { BareRequest } from '../../request';
export declare type CookiesManagerOptions = cookie.CookieSerializeOptions & {
    signed?: boolean;
    parseOptions?: cookie.CookieParseOptions;
    secret?: string | string[];
};
export declare class CookiesManager {
    private options;
    private flow;
    signer: null | ReturnType<typeof secretsOperator>;
    constructor(options: CookiesManagerOptions, flow: BareRequest);
    setCookie(name: string, value: string, options?: CookiesManagerOptions, signer?: ReturnType<typeof secretsOperator>): void;
    clearCookie(name: string, options?: CookiesManagerOptions): void;
    parseCookie(rawCookie?: string): {
        [k: string]: string;
    };
    unsignCookie(value: any): {
        valid: boolean;
        renew: boolean;
        value: string | null;
    } | undefined;
}
