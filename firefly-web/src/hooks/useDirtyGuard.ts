import { useCallback, useEffect } from 'react';
import { Modal } from 'antd';
import { useLocation } from 'react-router-dom';
import { setPathDirty } from '../utils/dirtyRegistry';

/**
 * Registers unsaved changes for the current route.
 *
 * - `beforeunload` protects against refresh / tab close.
 * - The layout reads the registry to confirm before closing a page tab.
 *
 * Call it with `open && form.isFieldsTouched()` for drawer/modal editors and
 * with the editor's own dirty flag for full-page editors.
 */
export function useDirtyGuard(dirty: boolean): void {
  const { pathname } = useLocation();

  useEffect(() => {
    setPathDirty(pathname, dirty);
    return () => setPathDirty(pathname, false);
  }, [dirty, pathname]);

  useEffect(() => {
    if (!dirty) {
      return undefined;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Chrome requires returnValue to be set for the native prompt to appear.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);
}

interface ConfirmDiscardOptions {
  title?: string;
  content?: string;
}

/**
 * Returns a helper that asks for confirmation before discarding unsaved edits.
 * When `dirty` is false the action runs immediately.
 */
export function useConfirmDiscard() {
  return useCallback(
    (dirty: boolean, action: () => void, options?: ConfirmDiscardOptions) => {
      if (!dirty) {
        action();
        return;
      }
      Modal.confirm({
        title: options?.title ?? '放弃未保存的修改？',
        content: options?.content ?? '关闭后本次填写的内容将丢失，且无法恢复。',
        okText: '放弃修改',
        cancelText: '继续编辑',
        okButtonProps: { danger: true },
        onOk: action,
      });
    },
    [],
  );
}
