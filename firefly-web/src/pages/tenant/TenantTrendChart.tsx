import React from 'react';
import { Line } from '@ant-design/charts';

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
    xAxis={{ label: { autoHide: true, autoRotate: false } }}
    yAxis={{ label: { formatter: (value: string) => formatValue(Number(value)) } }}
    tooltip={{
      formatter: (datum: TrendPoint) => ({
        name: metricLabel ?? '值',
        value: formatValue(datum.value),
      }),
    }}
  />
);

export default TenantTrendChart;
