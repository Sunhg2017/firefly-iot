export const simulatorStateStorage = {
  getItem: async (name: string) => {
    const electronValue = await window.electronAPI?.simulatorStoreGetItem(name);
    if (electronValue !== null && electronValue !== undefined) {
      return electronValue;
    }
    return window.localStorage.getItem(name);
  },
  setItem: async (name: string, value: string) => {
    await window.electronAPI?.simulatorStoreSetItem(name, value);
    window.localStorage.setItem(name, value);
  },
  removeItem: async (name: string) => {
    await window.electronAPI?.simulatorStoreRemoveItem(name);
    window.localStorage.removeItem(name);
  },
};
