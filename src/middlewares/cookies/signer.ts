import cookieSignature from 'cookie-signature';

export function secretsOperator(secret: string | string[]) {
  const secrets = Array.isArray(secret) ? secret : [secret];
  const [signingKey] = secrets;

  return {
    sign(value: string) {
      return cookieSignature.sign(value, signingKey);
    },
    unsign(signedValue) {
      let valid = false;
      let renew = false;
      let value: string | null = null;

      for (const key of secrets) {
        const result = cookieSignature.unsign(signedValue, key);

        if (result !== false) {
          valid = true;
          renew = key !== signingKey;
          value = result;
          break;
        }
      }

      return { valid, renew, value };
    },
  };
}
