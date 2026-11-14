import React from 'react';
import { Line } from '@ant-design/charts';
import dayjs from 'dayjs';

interface TrendPoint {
  date: string;
  value: number;
}

interface TenantTrendChartProps {
  data: TrendPoint[];
  metricLabel?: string;
  formatValue: (value: number) => string;
  height?: number;
}

const formatAxisDate = (value: string): string => {
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('MM-DD') : value;
};

const formatTooltipDate = (value: string): string => {
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : value;
};

/**
 * 租户用量趋势图。横轴使用 MM-DD 避免日期标签相互遮挡，tooltip 保留完整日期，
 * y 轴与 tooltip 都复用调用方的 formatValue（字节类指标会转成可读单位）。
 */
const TenantTrendChart: React.FC<TenantTrendChartProps> = ({
  data,
  metricLabel,
  formatValue,
  height = 320,
}) => (
  <Line
    data={data}
    xField="date"
    yField="value"
    height={height}
    color="#1677ff"
    point={{ size: 4, shape: 'circle' }}
    smooth
    legend={false}
    xAxis={{
      label: {
        autoHide: true,
        autoRotate: false,
        formatter: (value: string) => formatAxisDate(value),
      },
    }}
    yAxis={{ label: { formatter: (value: string) => formatValue(Number(value)) } }}
    tooltip={{
      formatter: (datum: TrendPoint) => ({
        name: `${metricLabel ?? '值'}（${formatTooltipDate(datum.date)}）`,
        value: formatValue(datum.value),
      }),
    }}
  />
);

export default TenantTrendChart;
