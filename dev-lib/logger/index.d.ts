/// <reference types="node" />
interface LogMeFn {
    (obj: unknown, ...args: []): void;
    (msg: string, ...args: any[]): void;
}
declare type LogMe = {
    info: LogMeFn;
    warn: LogMeFn;
    error: LogMeFn;
    fatal: LogMeFn;
    debug: LogMeFn;
    trace: LogMeFn;
};
export declare const logHttp: (headers: {
    [k: string]: any;
}, startDate: Date, remoteClient: string, req: import("http").IncomingMessage, res: import("http").ServerResponse) => void;
export declare const logMe: LogMe;
export {};
