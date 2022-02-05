export const JSONStringify = (data: any): string | null => {
  try {
    return JSON.stringify(data);
  } catch (e) {
    console.log('Error stringifying, data not serializable', e);
    return null;
  }
};

export const JSONParse = <R = any>(data: any): R | null => {
  try {
    return JSON.parse(data);
  } catch (e: any) {
    console.log('Error parsing, data not deserializable', e);
    return e;
  }
};
