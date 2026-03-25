// Mock for react-native-keychain — in-memory Keychain for Jest tests

let stored = null;

const mock = {
  setGenericPassword: jest.fn(async (username, password, options) => {
    stored = { username, password, service: options?.service };
    return true;
  }),
  getGenericPassword: jest.fn(async (options) => {
    if (stored && stored.service === options?.service) {
      return { username: stored.username, password: stored.password };
    }
    return false;
  }),
  resetGenericPassword: jest.fn(async (options) => {
    if (stored && stored.service === options?.service) {
      stored = null;
    }
    return true;
  }),
  ACCESSIBLE: {
    AFTER_FIRST_UNLOCK: 'AfterFirstUnlock',
  },
  __reset: () => {
    stored = null;
    mock.setGenericPassword.mockClear();
    mock.getGenericPassword.mockClear();
    mock.resetGenericPassword.mockClear();
  },
};

module.exports = mock;
