export const JSONStringify = (data: any) => {
  try {
    return JSON.stringify(data);
  } catch (e) {
    console.log('Error stringifying, data not serializable', e);
    return null;
  }
};

export const JSONParse = (data: any) => {
  try {
    return JSON.parse(data);
  } catch (e) {
    console.log('Error parsing, data not deserializable', e);
    return e;
  }
};
