/// <reference types="node" />
import { ServerOptions } from 'ws';
import { BareRequest, CacheOpts } from './request';
import { CookiesManagerOptions } from './middlewares/cookies/cookie-manager';
import { HttpMethodsUnion, StatusCodesUnion } from './utils';
import { CorsOptions } from './middlewares/cors/cors';
import { WebSocketServer } from './websocket';
import { Server } from 'http';
declare type Middleware = (flow: BareRequest) => Promise<void> | void;
declare type Handler = (flow: BareRequest) => any;
declare type ErrorHandler = (err: any, flow: BareRequest, status?: StatusCodesUnion) => void;
declare type IP = `${number}.${number}.${number}.${number}`;
declare type RouteOpts<C> = {
    disableCache?: C extends true ? C : undefined;
    cache?: C extends true ? undefined : CacheOpts;
    /**
     * Request timeout handler in `ms`
     */
    timeout?: number;
    middlewares?: Array<Middleware>;
};
declare type BareOptions<A extends IP> = {
    middlewares?: Array<Middleware>;
    /**
     * Opt-out request body parsing (de-serialization)
     * Default `false`
     */
    doNotParseBody?: boolean;
    serverPort?: number;
    /**
     * Address to bind the web server to
     * Default '0.0.0.0'
     */
    serverAddress?: A | 'localhost';
    /**
     * Enable request context storage
     * Default `false`
     */
    context?: boolean;
    /**
     * Enable request/response predefined logging
     * Default `false`
     */
    logging?: boolean;
    errorHandlerMiddleware?: ErrorHandler;
    /**
     * Request time format in `seconds` or `milliseconds`
     * Default - disabled
     */
    requestTimeFormat?: 's' | 'ms';
    /**
     * Control over cookies.
     * This will enable automatic cookies decoding
     */
    cookies?: boolean;
    cookiesOptions?: CookiesManagerOptions;
    /**
     * Log the resolved reverse DNS first hop for remote ip of the client (first proxy)
     */
    reverseDns?: boolean;
    /**
     * WebSocket server exposure
     */
    ws?: boolean;
    wsOptions?: Omit<ServerOptions, 'host' | 'port' | 'server' | 'noServer'> & {
        closeHandler?: (server: WebSocketServer) => Promise<void>;
    };
    /**
     * Enable Cors
     */
    cors?: boolean | CorsOptions;
};
interface HandlerExposed<K> {
    <R extends `/${string}`, C>(setUp: K extends 'declare' ? {
        route: R;
        options?: RouteOpts<C>;
        handler: Handler;
        methods: Array<HttpMethodsUnion>;
    } : {
        route: R;
        options?: RouteOpts<C>;
        handler: Handler;
    }): BareServer<any> & Routes;
}
export declare type RouteReport = {
    hits: number;
    success: number;
    fails: number;
};
export declare type Routes = {
    [K in HttpMethodsUnion | 'declare']: HandlerExposed<K>;
};
export declare type BareHttpType<A extends IP = any> = BareServer<A> & Routes;
export declare type ServerMergedType = {
    new <A extends IP>(args?: BareOptions<A>): BareHttpType<A>;
};
export declare class BareServer<A extends IP> {
    #private;
    private bareOptions;
    server: Server;
    ws?: WebSocketServer;
    constructor(bareOptions?: BareOptions<A>);
    private applyLaunchOptions;
    private applyMiddlewares;
    /**
     * This handler is used in async generated middlewares runtime function
     */
    private resolveMiddleware;
    private setRoute;
    private handleRoute;
    private encodeRoute;
    private explodeRoute;
    private basicErrorHandler;
    private stopWs;
    private attachGracefulHandlers;
    private attachRoutesDeclarator;
    get runtimeRoute(): Readonly<Routes>;
    start(cb?: (address: string) => void): Promise<void>;
    stop(cb?: (e?: Error) => void): Promise<void>;
    use(middleware: Middleware): this;
    getMiddlewares(): Middleware[];
    setCustomErrorHandler(eh: ErrorHandler): void;
    getRoutes(): string[];
}
declare const BareHttp: ServerMergedType;
export { BareHttp };
