"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializeHttp = exports.getStatusLevel = exports.serializeLog = exports.parseError = void 0;
const callsites_1 = __importDefault(require("callsites"));
const context_1 = require("../context");
const util_1 = __importDefault(require("util"));
function parseError(e, meta) {
    const toSend = { error: { ...e }, ...meta };
    toSend.message = e.message;
    toSend.error.stack = e.stack;
    toSend.error.kind = e.constructor.name;
    return toSend;
}
exports.parseError = parseError;
const makeLoggerMetadata = (method) => ({
    name: 'pino',
    version: 'v1.0.0',
    method_name: method,
});
const parseArgs = (argSlice) => argSlice.map((arg) => {
    if (util_1.default.types.isNativeError(arg))
        return parseError(arg, {});
    return arg;
});
function serializeLog(...args) {
    const site = (0, callsites_1.default)()[2];
    const meta = {
        timestamp: Date.now(),
        location: `${site.getFileName()}:${site.getLineNumber()}:${site.getColumnNumber()}`,
        logger: makeLoggerMetadata(site.getFunctionName()),
        trace: context_1.context.current?.store.get('id'),
    };
    if (!args.length)
        return { message: 'EMPTY_LOG', ...meta };
    if (args.length === 1) {
        if (typeof args[0] === 'string')
            return { message: args[0], ...meta };
        if (util_1.default.types.isNativeError(args[0]))
            return parseError(args[0], meta);
        if (args[0].message)
            return { message: args[0].message, ...args };
        return { message: 'EMPTY_MESSAGE', args: args[0], ...meta };
    }
    if (typeof args[0] === 'string')
        return { message: args.shift(), args: parseArgs(args), ...meta };
    return { message: 'EMPTY_MESSAGE', args: parseArgs(args), ...meta };
}
exports.serializeLog = serializeLog;
function apacheLogFormat(startDate, remoteClient, content, req, statusCode) {
    return `${req.headers['x-forwarded-for'] || req.socket.remoteAddress} ${remoteClient || '-'} ${startDate.toISOString()} "${req.method} ${req.url} HTTP/${req.httpVersionMajor}.${req.httpVersionMinor}" ${statusCode} ${content || '-'}`;
}
function getStatusLevel(statusCode) {
    if (statusCode >= 400 && statusCode < 500) {
        return 'warn';
    }
    else if (statusCode >= 500) {
        return 'error';
    }
    return 'info';
}
exports.getStatusLevel = getStatusLevel;
function serializeHttp(headers, startDate, remoteClient, req, res) {
    const executionId = context_1.context.current?.store.get('id');
    return {
        level: getStatusLevel(res.statusCode),
        logObject: {
            message: apacheLogFormat(startDate, remoteClient, headers['Content-Length'], req, res.statusCode),
            timestamp: Date.now(),
            trace: executionId,
            request: {
                headers: req.headers,
                http_version: req.httpVersion,
                id: req.headers['x-request-id'] || req.id || 'unknown',
                method: req.method,
                url: req.url,
            },
            response: {
                status_code: res.statusCode,
                headers: headers,
            },
            duration: headers['X-Processing-Time'] || 'unknown',
        },
    };
}
exports.serializeHttp = serializeHttp;
