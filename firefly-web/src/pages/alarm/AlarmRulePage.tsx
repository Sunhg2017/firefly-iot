import React from 'react';
import PageHeader from '../../components/PageHeader';
import { AlarmRulesPanel } from './AlarmPanels';

const AlarmRulePage: React.FC = () => {
  return (
    <div>
      <PageHeader
        title="\u544a\u8b66\u89c4\u5219\u7ef4\u62a4"
        description="\u9762\u5411\u89c4\u5219\u7ef4\u62a4\u4eba\u5458\uff0c\u8d1f\u8d23\u5b9a\u4e49\u544a\u8b66\u6761\u4ef6\u3001\u7ea7\u522b\u548c\u542f\u505c\u72b6\u6001\u3002"
      />
      <AlarmRulesPanel />
    </div>
  );
};

export default AlarmRulePage;
