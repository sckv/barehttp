import type { HttpMethodsUnionUppercase } from '../../utils';
import type { BareRequest } from '../../request';
export declare type CorsOptions = {
    origin?: string | RegExp;
    methods?: Array<HttpMethodsUnionUppercase>;
    preflightContinue?: boolean;
    optionsSuccessStatus?: 200 | 201 | 202 | 203 | 204;
    allowedHeaders?: string | string[];
    exposedHeaders?: string | string[];
    credentials?: boolean;
    maxAge?: number;
};
export declare class Cors {
    options: CorsOptions;
    defaults: {
        origin: string;
        methods: string[];
        preflightContinue: boolean;
        optionsSuccessStatus: number;
    };
    computedHeaders: {
        credentials: {};
        methods: {};
        maxAge: {};
        exposedHeaders: {};
    };
    constructor(corsOptions?: CorsOptions);
    private computeStaticHeaders;
    private isString;
    private isOriginAllowed;
    private configureOrigin;
    private configureMethods;
    private configureCredentials;
    private configureAllowedHeaders;
    private configureExposedHeaders;
    private configureMaxAge;
    corsMiddleware(flow: BareRequest): void;
}
