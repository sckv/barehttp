'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.Cors = void 0;
class Cors {
    options;
    defaults = {
        origin: '*',
        methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
        preflightContinue: false,
        optionsSuccessStatus: 204,
    };
    computedHeaders = {
        credentials: {},
        methods: {},
        maxAge: {},
        exposedHeaders: {},
    };
    constructor(corsOptions = {}) {
        this.options = Object.assign({}, this.defaults, corsOptions);
        this.computeStaticHeaders();
    }
    computeStaticHeaders() {
        this.computedHeaders = {
            credentials: this.configureCredentials(),
            methods: this.configureMethods(),
            maxAge: this.configureMaxAge(),
            exposedHeaders: this.configureExposedHeaders(),
        };
    }
    isString(s) {
        return typeof s === 'string' || s instanceof String;
    }
    isOriginAllowed(origin, allowedOrigin) {
        if (Array.isArray(allowedOrigin)) {
            for (let i = 0; i < allowedOrigin.length; ++i) {
                if (this.isOriginAllowed(origin, allowedOrigin[i])) {
                    return true;
                }
            }
            return false;
        }
        else if (this.isString(allowedOrigin)) {
            return origin === allowedOrigin;
        }
        else if (allowedOrigin instanceof RegExp) {
            return allowedOrigin.test(origin);
        }
        else {
            return !!allowedOrigin;
        }
    }
    configureOrigin(req) {
        const requestOrigin = req.headers.origin;
        const headers = {};
        let isAllowed;
        if (!this.options.origin || this.options.origin === '*') {
            // allow any origin
            Object.assign(headers, { 'Access-Control-Allow-Origin': '*' });
        }
        else if (this.isString(this.options.origin)) {
            // fixed origin
            Object.assign(headers, {
                'Access-Control-Allow-Origin': this.options.origin,
                Vary: 'Origin',
            });
        }
        else {
            isAllowed = this.isOriginAllowed(requestOrigin, this.options.origin);
            // reflect origin
            Object.assign(headers, {
                'Access-Control-Allow-Origin': isAllowed ? requestOrigin : false,
                Vary: 'Origin',
            });
        }
        return headers;
    }
    configureMethods() {
        const { methods } = this.options;
        return {
            'Access-Control-Allow-Methods': methods,
        };
    }
    configureCredentials() {
        if (this.options.credentials === true) {
            return {
                'Access-Control-Allow-Credentials': 'true',
            };
        }
        return {};
    }
    configureAllowedHeaders(req) {
        let { allowedHeaders } = this.options;
        const headers = {};
        if (!allowedHeaders) {
            allowedHeaders = req.headers['access-control-request-headers']; // .headers wasn't specified, so reflect the request headers
            Object.assign(headers, {
                Vary: 'Access-Control-Request-Headers',
            });
        }
        else if (Array.isArray(allowedHeaders)) {
            allowedHeaders = allowedHeaders.join(','); // .headers is an array, so turn it into a string
        }
        if (allowedHeaders && allowedHeaders.length) {
            Object.assign(headers, {
                'Access-Control-Allow-Headers': allowedHeaders,
            });
        }
        return headers;
    }
    configureExposedHeaders() {
        let headers = this.options.exposedHeaders;
        if (!headers) {
            return {};
        }
        else if (Array.isArray(headers)) {
            headers = headers.join(','); // .headers is an array, so turn it into a string
        }
        if (headers && headers.length) {
            return {
                'Access-Control-Expose-Headers': headers,
            };
        }
        return {};
    }
    configureMaxAge() {
        const maxAge = (typeof this.options.maxAge === 'number' || this.options.maxAge) &&
            this.options.maxAge.toString();
        if (maxAge && maxAge.length) {
            return { 'Access-Control-Max-Age': maxAge };
        }
        return {};
    }
    corsMiddleware(flow) {
        let headers = {};
        const req = flow._originalRequest;
        const method = req.method && req.method.toUpperCase && req.method.toUpperCase();
        if (method === 'OPTIONS') {
            // preflight
            headers = {
                ...this.configureOrigin(req),
                ...this.configureAllowedHeaders(req),
                ...this.computedHeaders.credentials,
                ...this.computedHeaders.maxAge,
                ...this.computedHeaders.exposedHeaders,
                ...this.computedHeaders.methods,
            };
            flow.setHeaders(headers);
            if (!this.options.preflightContinue) {
                // Safari (and potentially other browsers) need content-length 0,
                //   for 204 or they just hang waiting for a body
                flow.status(this.options.optionsSuccessStatus);
                flow.setHeader('Content-Length', '0');
                flow.send();
            }
        }
        else {
            // actual response
            headers = {
                ...this.configureOrigin(req),
                ...this.computedHeaders.credentials,
                ...this.computedHeaders.exposedHeaders,
            };
            flow.setHeaders(headers);
        }
    }
}
exports.Cors = Cors;
