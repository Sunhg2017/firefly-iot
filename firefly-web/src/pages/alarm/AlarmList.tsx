import React from 'react';
import { Navigate } from 'react-router-dom';

const AlarmList: React.FC = () => {
  // Keep legacy bookmarks working after the menu split.
  return <Navigate to="/alarm-records" replace />;
};

export default AlarmList;
