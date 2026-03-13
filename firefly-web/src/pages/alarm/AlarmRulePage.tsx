import React from 'react';
import PageHeader from '../../components/PageHeader';
import { AlarmRulesPanel } from './AlarmPanels';
import { ALARM_TEXT } from './alarmText';

const AlarmRulePage: React.FC = () => {
  return (
    <div>
      <PageHeader
        title={ALARM_TEXT.ruleTitle}
        description={ALARM_TEXT.ruleDescription}
      />
      <AlarmRulesPanel />
    </div>
  );
};

export default AlarmRulePage;
