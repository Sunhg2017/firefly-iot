import React from 'react';
import PageHeader from '../../components/PageHeader';
import { AlarmRecordsPanel } from './AlarmPanels';

const AlarmRecordPage: React.FC = () => {
  return (
    <div>
      <PageHeader
        title="\u544a\u8b66\u5904\u7406"
        description="\u9762\u5411\u503c\u73ed\u548c\u8fd0\u7ef4\u4eba\u5458\uff0c\u8d1f\u8d23\u786e\u8ba4\u3001\u5904\u7406\u548c\u5173\u95ed\u5df2\u89e6\u53d1\u7684\u544a\u8b66\u8bb0\u5f55\u3002"
      />
      <AlarmRecordsPanel />
    </div>
  );
};

export default AlarmRecordPage;
