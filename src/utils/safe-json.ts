export const JSONStringify = (data: any) => {
  try {
    return JSON.stringify(data);
  } catch (e) {
    console.log('Error stringifying', e);
    return 'Not serializable';
  }
};
