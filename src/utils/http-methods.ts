export const HttpMethods = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  delete: 'DELETE',
  patch: 'PATCH',
  options: 'OPTIONS',
  head: 'HEAD',
} as const;

export type HttpMethodsUnion = keyof typeof HttpMethods;
export type HttpMethodsUnionUppercase = typeof HttpMethods[keyof typeof HttpMethods];
