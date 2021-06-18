import cookie from 'cookie';

import { secretsOperator } from './signer';

import { logMe } from '../../logger';

import type { BareRequest } from '../../request';

export type CookiesManagerOptions = cookie.CookieSerializeOptions & {
  signed?: boolean;
  parseOptions?: cookie.CookieParseOptions;
  secret?: string | string[];
};

export class CookiesManager {
  signer: null | ReturnType<typeof secretsOperator>;

  constructor(private options: CookiesManagerOptions = {}, private flow: BareRequest) {
    const secret = this.options.secret || '';
    const enableRotation = Array.isArray(secret);
    this.signer = typeof secret === 'string' || enableRotation ? secretsOperator(secret) : null;
  }

  setCookie(
    name: string,
    value: string,
    options?: CookiesManagerOptions,
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
    let setCookie = this.flow.getHeader('Set-Cookie');

    if (!setCookie) {
      this.flow.setHeader('Set-Cookie', serialized);
      return;
    }

    if (typeof setCookie === 'string') {
      setCookie = [setCookie];
    }

    setCookie.push(serialized);
    this.flow.setHeader('Set-Cookie', setCookie);
  }

  clearCookie(name: string, options: CookiesManagerOptions = {}) {
    const opts = {
      path: '/',
      ...options,
      expires: new Date(1),
      signed: undefined,
      maxAge: undefined,
    };

    return this.setCookie(name, '', opts);
  }

  parseCookie(rawCookie?: string): { [k: string]: string } {
    if (!rawCookie) return {};
    const result = {};
    const values = rawCookie?.split(';');
    for (let i = 0; i < values.length - 1; i++) {
      const split = values[i].trim().split('=');
      if (split.length == 2) result[split[0]] = split[1];
    }
    return result;
  }

  unsignCookie(value) {
    if (!this.signer) {
      logMe.error('No signer defined for the cookies, unsign wont work');
      return;
    }
    return this.signer.unsign(value);
  }
}
