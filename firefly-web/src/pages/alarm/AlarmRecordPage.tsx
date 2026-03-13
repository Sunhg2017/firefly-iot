import React from 'react';
import PageHeader from '../../components/PageHeader';
import { AlarmRecordsPanel } from './AlarmPanels';
import { ALARM_TEXT } from './alarmText';

const AlarmRecordPage: React.FC = () => {
  return (
    <div>
      <PageHeader
        title={ALARM_TEXT.recordTitle}
        description={ALARM_TEXT.recordDescription}
      />
      <AlarmRecordsPanel />
    </div>
  );
};

export default AlarmRecordPage;
