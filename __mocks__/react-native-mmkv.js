// Mock for react-native-mmkv — used in Jest tests
// Returns an in-memory Map-backed MMKV instance

function createMMKV() {
  const store = new Map();
  return {
    set: (key, value) => store.set(key, value),
    getString: (key) => store.get(key),
    getBoolean: (key) => store.get(key),
    getNumber: (key) => store.get(key),
    remove: (key) => store.delete(key),
    clearAll: () => store.clear(),
    getAllKeys: () => Array.from(store.keys()),
    contains: (key) => store.has(key),
  };
}

module.exports = { createMMKV };
