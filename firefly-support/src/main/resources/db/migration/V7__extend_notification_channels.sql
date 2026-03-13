COMMENT ON COLUMN notification_channels.type IS 'Supported channels: EMAIL/SMS/PHONE/WEBHOOK/DINGTALK/WECHAT/IN_APP';
COMMENT ON COLUMN message_templates.channel IS 'Supported channels: SMS/EMAIL/PHONE/WEBHOOK/DINGTALK/WECHAT/IN_APP';
COMMENT ON COLUMN notification_templates.channel IS 'Supported channels: EMAIL/SMS/PHONE/WEBHOOK/DINGTALK/WECHAT/IN_APP';

INSERT INTO notification_templates (tenant_id, code, name, channel, subject, content, variables)
VALUES
    (0, 'ALARM_PHONE', '告警电话通知', 'PHONE', '告警电话通知', '设备 ${device_name} 于 ${alarm_time} 触发 ${alarm_level} 告警，请及时处理。', 'device_name,alarm_time,alarm_level'),
    (0, 'ALARM_WECHAT', '告警企业微信通知', 'WECHAT', '告警通知', '### 告警通知\n设备：${device_name}\n级别：${alarm_level}\n内容：${alarm_content}\n时间：${alarm_time}', 'device_name,alarm_level,alarm_content,alarm_time'),
    (0, 'ALARM_DINGTALK', '告警钉钉通知', 'DINGTALK', '告警通知', '### 告警通知\n- 设备：${device_name}\n- 级别：${alarm_level}\n- 内容：${alarm_content}\n- 时间：${alarm_time}', 'device_name,alarm_level,alarm_content,alarm_time'),
    (0, 'ALARM_IN_APP', '告警站内信通知', 'IN_APP', '设备告警通知', '设备 ${device_name} 于 ${alarm_time} 触发 ${alarm_level} 告警：${alarm_content}', 'device_name,alarm_time,alarm_level,alarm_content')
ON CONFLICT DO NOTHING;
