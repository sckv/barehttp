import cookie from 'cookie';

import { secretsOperator } from './signer';

import { BareRequest } from '../../request';
import { logMe } from '../../logger';

export type CookieManagerOptions = cookie.CookieSerializeOptions & {
  signed?: boolean;
  parseOptions?: cookie.CookieParseOptions;
  secret?: string | string[];
};

export class CookieManager {
  signer: null | ReturnType<typeof secretsOperator>;

  constructor(private options: CookieManagerOptions = {}, private flow: BareRequest) {
    const secret = this.options.secret || '';
    const enableRotation = Array.isArray(secret);
    this.signer = typeof secret === 'string' || enableRotation ? secretsOperator(secret) : null;
  }

  setCookie(
    name: string,
    value: string,
    options?: CookieManagerOptions,
    signer?: ReturnType<typeof secretsOperator>,
  ) {
    const localSigner = signer || this.signer;
    const opts = options || this.options;
    if (opts.expires && Number.isInteger(opts.expires)) {
      opts.expires = new Date(opts.expires);
    }

    if (opts.signed && localSigner) {
      value = localSigner.sign(value);
    }

    const serialized = cookie.serialize(name, value, opts);
    let setCookie = this.flow.getHeader('set-cookie');

    if (!setCookie) {
      this.flow.setHeader('set-cookie', serialized);
      return;
    }

    if (typeof setCookie === 'string') {
      setCookie = [setCookie];
    }

    setCookie.push(serialized);
    this.flow.setHeader('set-cookie', setCookie);
  }

  clearCookie(name: string, options: CookieManagerOptions = {}) {
    const opts = {
      path: '/',
      ...options,
      expires: new Date(1),
      signed: undefined,
      maxAge: undefined,
    };

    return this.setCookie(name, '', opts);
  }

  parseCookie(rawCookie?: string) {
    if (!rawCookie) return;
    return cookie.parse(rawCookie, this.options.parseOptions);
  }

  middleware(flow: BareRequest) {
    flow._populateCookies(this.parseCookie(flow._originalRequest.headers.cookie));
  }

  unsignCookie(value) {
    if (!this.signer) {
      logMe.error('No signer defined for the cookies, unsign wont work');
      return;
    }
    return this.signer.unsign(value);
  }
}
