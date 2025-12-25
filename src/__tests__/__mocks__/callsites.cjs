function mockCallsite() {
  return {
    getFileName() {
      return 'mock';
    },
    getLineNumber() {
      return 1;
    },
    getColumnNumber() {
      return 1;
    },
    getFunctionName() {
      return 'mock';
    },
  };
}

module.exports = function callsites() {
  return [mockCallsite(), mockCallsite(), mockCallsite()];
};
