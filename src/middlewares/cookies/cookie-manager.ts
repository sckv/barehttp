import { serialize, type ParseOptions, type SerializeOptions } from 'cookie';

import { secretsOperator } from './signer.js';

import { logMe } from '../../logger/index.js';
import type { BareRequest } from '../../request.js';

export type CookiesManagerOptions = Omit<SerializeOptions, 'expires'> & {
  expires?: Date | number;
  signed?: boolean;
  parseOptions?: ParseOptions;
  secret?: string | string[];
};

export class CookiesManager {
  signer: null | ReturnType<typeof secretsOperator>;

  constructor(
    private options: CookiesManagerOptions = {},
    private flow: BareRequest,
  ) {
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
    const { signed, ...rest } = opts;
    const normalizedExpires =
      typeof rest.expires === 'number' ? new Date(rest.expires) : rest.expires;
    const serializeOptions: SerializeOptions = {
      ...rest,
      expires: normalizedExpires,
    };

    if (signed && localSigner) {
      value = localSigner.sign(value);
    }

    const serialized = serialize(name, value, serializeOptions);
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
