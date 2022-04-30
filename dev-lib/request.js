"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BareRequest = void 0;
const hyperid_1 = __importDefault(require("hyperid"));
const utils_1 = require("./utils/");
const safe_json_1 = require("./utils/safe-json");
const logger_1 = require("./logger");
const cookie_manager_1 = require("./middlewares/cookies/cookie-manager");
const util_1 = require("util");
const stream_1 = require("stream");
const url_1 = __importDefault(require("url"));
const generateId = (0, hyperid_1.default)();
const statusTuples = Object.entries(utils_1.StatusCodes).reduce((acc, [name, status]) => {
    acc[status] = utils_1.StatusPhrases[name];
    return acc;
}, {});
class BareRequest {
    _originalRequest;
    _originalResponse;
    ID;
    params = {};
    query = {};
    remoteIp;
    requestBody;
    requestHeaders;
    statusToSend = 200;
    cm;
    sent = false;
    cache = true;
    startTime;
    startDate = new Date();
    remoteClient = '';
    logging = false;
    requestTimeFormat;
    headers = {};
    cookies = {};
    contentType;
    timeout;
    constructor(_originalRequest, _originalResponse, options) {
        this._originalRequest = _originalRequest;
        this._originalResponse = _originalResponse;
        this.ID = { code: _originalRequest.headers['x-request-id'] || generateId() };
        this.remoteIp = _originalRequest.socket.remoteAddress;
        this.contentType = this._originalRequest.headers['content-type'];
        this.requestHeaders = this._originalRequest.headers;
        this.logging = options?.logging ?? false;
        // this is a placeholder URL base that we need to make class working
        new url_1.default.URL(`http://localhost/${this._originalRequest.url}`).searchParams.forEach((value, name) => (this.query[name] = value));
        // parsed;
        _originalRequest['flow'] = this; // to receive flow object later on in the route handler
        this.addHeaders({
            'Content-Type': 'text/plain; charset=utf-8',
            'X-Request-Id': this.ID.code,
        });
        if (options?.requestTimeFormat) {
            this.startTime = process.hrtime();
            this.requestTimeFormat = options.requestTimeFormat;
        }
    }
    readBody() {
        switch (this._originalRequest.method) {
            case 'POST':
            case 'PATCH':
            case 'PUT':
                return new Promise((resolve, reject) => {
                    const temp = [];
                    this._originalRequest
                        .on('data', (chunk) => temp.push(chunk))
                        .on('end', () => {
                        const parsed = this.classifyRequestBody(temp);
                        if (util_1.types.isNativeError(parsed))
                            return reject(parsed);
                        this.requestBody = parsed;
                        resolve(parsed);
                    })
                        .on('error', reject);
                });
            default:
                return;
        }
    }
    attachCookieManager(opts) {
        this.cm = new cookie_manager_1.CookiesManager(opts, this);
    }
    populateCookies() {
        this.cookies = this.cm?.parseCookie(this._originalRequest.headers.cookie) || {};
    }
    classifyRequestBody(data) {
        const wholeChunk = Buffer.concat(data);
        switch (this.contentType) {
            case 'text/plain':
                return wholeChunk.toString();
            case 'application/json':
                return (0, safe_json_1.JSONParse)(wholeChunk.toString());
            case 'application/x-www-form-urlencoded':
                const store = {};
                for (const curr of wholeChunk.toString().split('&')) {
                    const [key, value] = curr.split('=');
                    if (!key || !value)
                        return null; // form urlencoded is not correct
                    store[key] = value;
                }
                return store;
            default:
                return wholeChunk;
        }
    }
    setRemoteClient(remoteClient) {
        this.remoteClient = remoteClient;
    }
    setRequestTime() {
        const diff = process.hrtime(this.startTime);
        const time = diff[0] * (this.requestTimeFormat === 's' ? 1 : 1e3) +
            diff[1] * (this.requestTimeFormat === 's' ? 1e-9 : 1e-6);
        this.setHeaders({
            'X-Processing-Time': time,
            'X-Processing-Time-Mode': this.requestTimeFormat === 's' ? 'seconds' : 'milliseconds',
        });
    }
    cleanHeader(header) {
        delete this.headers[header];
    }
    attachTimeout(timeout) {
        if (this.timeout)
            clearTimeout(this.timeout);
        this.timeout = setTimeout(() => {
            this.status(503)._send('Server aborted connection by overtime');
        }, timeout);
        // attach listener to clear the timeout
        this._originalResponse.on('close', () => this.timeout && clearTimeout(this.timeout));
    }
    setParams(params) {
        this.params = params;
    }
    // ======== PUBLIC APIS ========
    getHeader(header) {
        return this.headers[header];
    }
    getCookie(cookie) {
        return this.cookies[cookie];
    }
    getCookies() {
        return { ...this.cookies };
    }
    disableCache() {
        this.cache = false;
    }
    setCache(cacheOpts) {
        const cacheHeader = [];
        const directive = 'Cache-Control';
        if (cacheOpts.cacheability)
            cacheHeader.push(cacheOpts.cacheability);
        if (cacheOpts.expirationKind)
            cacheHeader.push(`${cacheOpts.expirationKind}=${cacheOpts.expirationSeconds ?? 3600}`);
        if (cacheOpts.revalidation)
            cacheHeader.push(cacheOpts.revalidation);
        if (cacheHeader.length > 0)
            this.setHeader(directive, cacheHeader);
    }
    addHeader(header, value) {
        const old = this.headers[header];
        const parsedVal = Array.isArray(value) ? value.join(', ') : '' + value;
        if (old) {
            this.headers[header] += `, ${parsedVal}`;
        }
        else {
            this.headers[header] = parsedVal;
        }
    }
    setHeader(header, value) {
        const parsedVal = Array.isArray(value) ? value.join(', ') : '' + value;
        this.headers[header] = parsedVal;
    }
    setHeaders(headers) {
        for (const [header, value] of Object.entries(headers)) {
            this.setHeader(header, value);
        }
    }
    addHeaders(headers) {
        for (const [header, value] of Object.entries(headers)) {
            this.addHeader(header, value);
        }
    }
    status(status) {
        this.statusToSend = status;
        return this;
    }
    sendStatus(status) {
        this.status(status)._send();
    }
    stream(stream) {
        this._originalResponse.pipe(stream, { end: true });
    }
    json(data) {
        // to generate with fast-json-stringify schema issue #1
        const jsoned = (0, safe_json_1.JSONStringify)(data);
        this.setHeader('Content-Type', 'application/json');
        this._send(jsoned ? jsoned : undefined);
    }
    _send(chunk) {
        if (this._originalResponse.socket?.destroyed) {
            logger_1.logMe.error("Tying to send into closed client's stream");
            return;
        }
        if (this._originalResponse.headersSent || this.sent) {
            logger_1.logMe.error('Trying to send with the headers already sent');
            return;
        }
        this.sent = true;
        // work basic headers
        if (typeof chunk !== 'undefined' && chunk !== null)
            this.setHeader('Content-Length', Buffer.byteLength(chunk, 'utf-8'));
        if (!this.cache)
            this.setHeaders({ 'Cache-Control': 'no-store', Expire: 0, Pragma: 'no-cache' });
        if (this.statusToSend >= 400 && this.statusToSend !== 404 && this.statusToSend !== 410)
            this.cleanHeader('Cache-Control');
        if (this.requestTimeFormat)
            this.setRequestTime();
        // perform sending
        this._originalResponse.writeHead(this.statusToSend, '', this.headers);
        this._originalResponse.end(chunk || statusTuples[this.statusToSend]);
        // call logging section
        if (this.logging === true) {
            (0, logger_1.logHttp)(this.headers, this.startDate, this.remoteClient, this._originalRequest, this._originalResponse);
        }
    }
    send(anything) {
        if (this.sent)
            return;
        if (typeof anything === 'undefined' || anything === null)
            return this._send();
        switch (anything.constructor) {
            case Uint8Array:
            case Uint16Array:
            case Uint32Array:
                this._send(Buffer.from(anything.buffer));
                break;
            case Buffer:
            case String:
                this._send(anything);
                break;
            case Boolean:
            case Number:
                this._send('' + anything);
                break;
            case stream_1.Writable:
                this.stream(anything);
                break;
            case Object:
                this.json(anything);
                break;
            default:
                this._send();
                logger_1.logMe.warn('Unknown type to send');
        }
    }
}
exports.BareRequest = BareRequest;
