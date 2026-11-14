import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Select, Spin } from 'antd';
import { deviceApi, productApi, tenantApi, userApi } from '../services/api';

export interface RemoteOption {
  value: number;
  label: string;
}

interface UseRemoteOptionsOptions {
  debounceMs?: number;
}

/**
 * Debounced remote-option loader for entity pickers.
 *
 * Every picker used to preload a fixed 500 rows and filter locally, which silently
 * hid entities beyond that window. Loading by keyword keeps the list complete.
 */
export function useRemoteOptions<T>(
  loader: (keyword: string) => Promise<T[]>,
  toOption: (item: T) => RemoteOption,
  { debounceMs = 300 }: UseRemoteOptionsOptions = {},
) {
  const [options, setOptions] = useState<RemoteOption[]>([]);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const loaderRef = useRef(loader);
  const toOptionRef = useRef(toOption);

  useEffect(() => {
    loaderRef.current = loader;
    toOptionRef.current = toOption;
  });

  const load = useCallback(async (keyword: string) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    try {
      const records = await loaderRef.current(keyword);
      if (mountedRef.current && requestId === requestIdRef.current) {
        setOptions(records.map((item) => toOptionRef.current(item)));
      }
    } catch {
      // A failed lookup must not break the form; the page-level action still reports its own errors.
      if (mountedRef.current && requestId === requestIdRef.current) {
        setOptions([]);
      }
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const onSearch = useCallback((keyword: string) => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
    if (!debounceMs) {
      void load(keyword);
      return;
    }
    timerRef.current = window.setTimeout(() => {
      void load(keyword);
    }, debounceMs);
  }, [debounceMs, load]);

  const mergeOption = useCallback((option: RemoteOption) => {
    setOptions((previous) => (
      previous.some((item) => item.value === option.value) ? previous : [option, ...previous]
    ));
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load('');
    return () => {
      mountedRef.current = false;
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [load]);

  return { options, loading, onSearch, mergeOption };
}

interface EntitySelectProps extends BaseEntitySelectProps {
  options: RemoteOption[];
  loading: boolean;
  onSearch: (keyword: string) => void;
}

const EntitySelect: React.FC<EntitySelectProps> = ({
  value,
  onChange,
  placeholder,
  disabled,
  allowClear = true,
  style,
  options,
  loading,
  onSearch,
}) => (
  <Select<number>
    value={value ?? undefined}
    onChange={(next) => onChange?.(next ?? undefined)}
    placeholder={placeholder}
    disabled={disabled}
    allowClear={allowClear}
    showSearch
    filterOption={false}
    onSearch={onSearch}
    options={options}
    loading={loading}
    style={style}
    notFoundContent={loading ? <Spin size="small" /> : '未找到匹配项，换个关键字试试'}
  />
);

interface BaseEntitySelectProps {
  value?: number | null;
  onChange?: (value: number | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  style?: React.CSSProperties;
  /** Label shown when an edit form presets a value that is not in the current option page. */
  pinnedLabel?: string;
}

interface UserRecord {
  id: number;
  username: string;
  realName?: string | null;
}

export const UserSelect: React.FC<BaseEntitySelectProps> = ({ pinnedLabel, ...rest }) => {
  const { options, loading, onSearch, mergeOption } = useRemoteOptions<UserRecord>(
    async (keyword) => {
      const res = await userApi.list({ pageNum: 1, pageSize: 20, keyword: keyword || undefined });
      return (res.data.data?.records ?? []) as UserRecord[];
    },
    (item) => ({
      value: item.id,
      label: item.realName ? `${item.realName}（${item.username}）` : item.username,
    }),
  );

  useEffect(() => {
    if (rest.value && pinnedLabel) {
      mergeOption({ value: rest.value, label: pinnedLabel });
    }
  }, [mergeOption, pinnedLabel, rest.value]);

  return <EntitySelect {...rest} options={options} loading={loading} onSearch={onSearch} placeholder={rest.placeholder ?? '输入姓名或账号搜索'} />;
};

interface ProductRecord {
  id: number;
  name: string;
  productKey: string;
}

export const ProductSelect: React.FC<BaseEntitySelectProps> = ({ pinnedLabel, ...rest }) => {
  const { options, loading, onSearch, mergeOption } = useRemoteOptions<ProductRecord>(
    async (keyword) => {
      const res = await productApi.list({ pageNum: 1, pageSize: 20, keyword: keyword || undefined });
      return (res.data.data?.records ?? []) as ProductRecord[];
    },
    (item) => ({ value: item.id, label: `${item.name}（${item.productKey}）` }),
  );

  useEffect(() => {
    if (rest.value && pinnedLabel) {
      mergeOption({ value: rest.value, label: pinnedLabel });
    }
  }, [mergeOption, pinnedLabel, rest.value]);

  return <EntitySelect {...rest} options={options} loading={loading} onSearch={onSearch} placeholder={rest.placeholder ?? '输入产品名称或 productKey 搜索'} />;
};

interface DeviceRecord {
  id: number;
  deviceName: string;
  nickname?: string | null;
}

export const DeviceSelect: React.FC<BaseEntitySelectProps & { productId?: number }> = ({ pinnedLabel, productId, ...rest }) => {
  const { options, loading, onSearch, mergeOption } = useRemoteOptions<DeviceRecord>(
    async (keyword) => {
      const res = await deviceApi.list({
        pageNum: 1,
        pageSize: 20,
        keyword: keyword || undefined,
        productId,
      });
      return (res.data.data?.records ?? []) as DeviceRecord[];
    },
    (item) => ({
      value: item.id,
      label: item.nickname ? `${item.deviceName}（${item.nickname}）` : item.deviceName,
    }),
  );

  useEffect(() => {
    if (rest.value && pinnedLabel) {
      mergeOption({ value: rest.value, label: pinnedLabel });
    }
  }, [mergeOption, pinnedLabel, rest.value]);

  return <EntitySelect {...rest} options={options} loading={loading} onSearch={onSearch} placeholder={rest.placeholder ?? '输入设备名称搜索'} />;
};

interface TenantRecord {
  id: number;
  name: string;
  code: string;
}

export const TenantSelect: React.FC<BaseEntitySelectProps> = ({ pinnedLabel, ...rest }) => {
  const { options, loading, onSearch, mergeOption } = useRemoteOptions<TenantRecord>(
    async (keyword) => {
      const res = await tenantApi.list({ pageNum: 1, pageSize: 20, keyword: keyword || undefined });
      return (res.data.data?.records ?? []) as TenantRecord[];
    },
    (item) => ({ value: item.id, label: `${item.name}（${item.code}）` }),
  );

  useEffect(() => {
    if (rest.value && pinnedLabel) {
      mergeOption({ value: rest.value, label: pinnedLabel });
    }
  }, [mergeOption, pinnedLabel, rest.value]);

  return <EntitySelect {...rest} options={options} loading={loading} onSearch={onSearch} placeholder={rest.placeholder ?? '输入租户名称或编码搜索'} />;
};
