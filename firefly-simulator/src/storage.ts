const LOCAL_STORAGE_LIMIT = 1024 * 1024;
const PERSIST_DEBOUNCE_MS = 200;

let pending: { name: string; value: string } | null = null;
let timer: number | null = null;

async function flush(): Promise<void> {
  const entry = pending;
  pending = null;
  if (timer) {
    window.clearTimeout(timer);
    timer = null;
  }
  if (!entry) {
    return;
  }
  await window.electronAPI?.simulatorStoreSetItem(entry.name, entry.value);
  // localStorage 只作为浏览器预览/无 Electron 环境的兜底；大批量设备配置可能超过 5MB，
  // 超过 1MB 时不再写 localStorage，避免 QuotaExceeded 阻断持久化。
  if (entry.value.length <= LOCAL_STORAGE_LIMIT) {
    try {
      window.localStorage.setItem(entry.name, entry.value);
    } catch {
      // ignore quota errors
    }
  }
}

function schedule(name: string, value: string): void {
  pending = { name, value };
  if (timer) {
    window.clearTimeout(timer);
  }
  timer = window.setTimeout(() => {
    void flush();
  }, PERSIST_DEBOUNCE_MS);
}

/**
 * 状态持久化适配器。
 *
 * 批量连接/批量创建会高频更新设备状态，如果每次 setState 都全量写 Electron store +
 * localStorage，上千台设备时会明显卡顿。这里做 200ms 合并写入；localStorage 只保存
 * 1MB 以内的数据，大配置以 Electron store 为准。
 */
export const simulatorStateStorage = {
  getItem: async (name: string) => {
    const electronValue = await window.electronAPI?.simulatorStoreGetItem(name);
    if (electronValue !== null && electronValue !== undefined) {
      return electronValue;
    }
    return window.localStorage.getItem(name);
  },
  setItem: async (name: string, value: string) => {
    schedule(name, value);
  },
  removeItem: async (name: string) => {
    pending = null;
    if (timer) {
      window.clearTimeout(timer);
      timer = null;
    }
    await window.electronAPI?.simulatorStoreRemoveItem(name);
    window.localStorage.removeItem(name);
  },
};

window.addEventListener('beforeunload', () => {
  if (pending && pending.value.length <= LOCAL_STORAGE_LIMIT) {
    try {
      window.localStorage.setItem(pending.name, pending.value);
    } catch {
      // ignore
    }
  }
});
