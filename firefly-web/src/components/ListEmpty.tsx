import React from 'react';
import { Button, Empty } from 'antd';

interface ListEmptyProps {
  /** True when the list would otherwise show data but a filter/search is active. */
  hasFilters?: boolean;
  emptyText?: React.ReactNode;
  filteredText?: React.ReactNode;
  onClearFilters?: () => void;
  compact?: boolean;
}

/**
 * Distinguishes "nothing has been created yet" from "no row matches the current filters".
 * Showing the same "暂无数据" for both makes users think their data disappeared.
 */
const ListEmpty: React.FC<ListEmptyProps> = ({
  hasFilters = false,
  emptyText = '暂无数据',
  filteredText = '没有符合当前筛选条件的数据',
  onClearFilters,
  compact = false,
}) => (
  <Empty
    image={Empty.PRESENTED_IMAGE_SIMPLE}
    description={hasFilters ? filteredText : emptyText}
    style={{ margin: compact ? '12px 0' : '32px 0' }}
  >
    {hasFilters && onClearFilters ? (
      <Button size="small" onClick={onClearFilters}>清空筛选条件</Button>
    ) : null}
  </Empty>
);

export default ListEmpty;
