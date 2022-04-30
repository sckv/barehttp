/// <reference types="node" />
import type { IncomingMessage, ServerResponse } from 'http';
export declare function parseError(e: any, meta: any): any;
export declare function serializeLog(...args: any[]): any;
export declare function getStatusLevel(statusCode: number): "error" | "warn" | "info";
export declare function serializeHttp(headers: {
    [k: string]: any;
}, startDate: Date, remoteClient: string, req: IncomingMessage, res: ServerResponse): {
    level: string;
    logObject: {
        message: string;
        timestamp: number;
        trace: string | number | undefined;
        request: {
            headers: import("http").IncomingHttpHeaders;
            http_version: string;
            id: any;
            method: string | undefined;
            url: string | undefined;
        };
        response: {
            status_code: number;
            headers: {
                [k: string]: any;
            };
        };
        duration: any;
    };
};
