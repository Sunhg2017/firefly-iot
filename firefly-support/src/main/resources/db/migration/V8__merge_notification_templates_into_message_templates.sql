INSERT INTO message_templates (
    tenant_id,
    code,
    name,
    channel,
    template_type,
    subject,
    content,
    variables,
    enabled,
    description
)
VALUES
    (
        0,
        'ALARM_EMAIL',
        '告警邮件通知',
        'EMAIL',
        'TEXT',
        '【${platform_name}】告警通知 - ${alarm_level}',
        '设备 ${device_name} (${device_id}) 于 ${alarm_time} 触发 ${alarm_level} 告警：${alarm_content}',
        '[{"name":"platform_name","desc":"平台名称"},{"name":"device_name","desc":"设备名称"},{"name":"device_id","desc":"设备编码"},{"name":"alarm_time","desc":"告警时间"},{"name":"alarm_level","desc":"告警级别"},{"name":"alarm_content","desc":"告警内容"}]',
        TRUE,
        '系统默认告警邮件模板'
    ),
    (
        0,
        'ALARM_SMS',
        '告警短信通知',
        'SMS',
        'TEXT',
        NULL,
        '【${platform_name}】设备 ${device_name} 触发 ${alarm_level} 告警：${alarm_content}',
        '[{"name":"platform_name","desc":"平台名称"},{"name":"device_name","desc":"设备名称"},{"name":"alarm_level","desc":"告警级别"},{"name":"alarm_content","desc":"告警内容"}]',
        TRUE,
        '系统默认告警短信模板'
    ),
    (
        0,
        'ALARM_PHONE',
        '告警电话通知',
        'PHONE',
        'TEXT',
        '告警电话通知',
        '设备 ${device_name} 于 ${alarm_time} 触发 ${alarm_level} 告警，请及时处理。',
        '[{"name":"device_name","desc":"设备名称"},{"name":"alarm_time","desc":"告警时间"},{"name":"alarm_level","desc":"告警级别"}]',
        TRUE,
        '系统默认告警电话模板'
    ),
    (
        0,
        'ALARM_WECHAT',
        '告警企业微信通知',
        'WECHAT',
        'MARKDOWN',
        '告警通知',
        '### 告警通知\n设备：${device_name}\n级别：${alarm_level}\n内容：${alarm_content}\n时间：${alarm_time}',
        '[{"name":"device_name","desc":"设备名称"},{"name":"alarm_level","desc":"告警级别"},{"name":"alarm_content","desc":"告警内容"},{"name":"alarm_time","desc":"告警时间"}]',
        TRUE,
        '系统默认企业微信告警模板'
    ),
    (
        0,
        'ALARM_DINGTALK',
        '告警钉钉通知',
        'DINGTALK',
        'MARKDOWN',
        '告警通知',
        '### 告警通知\n- 设备：${device_name}\n- 级别：${alarm_level}\n- 内容：${alarm_content}\n- 时间：${alarm_time}',
        '[{"name":"device_name","desc":"设备名称"},{"name":"alarm_level","desc":"告警级别"},{"name":"alarm_content","desc":"告警内容"},{"name":"alarm_time","desc":"告警时间"}]',
        TRUE,
        '系统默认钉钉告警模板'
    ),
    (
        0,
        'ALARM_WEBHOOK',
        '告警 Webhook 通知',
        'WEBHOOK',
        'TEXT',
        NULL,
        '{"event":"alarm","deviceName":"${device_name}","deviceId":"${device_id}","level":"${alarm_level}","content":"${alarm_content}","time":"${alarm_time}"}',
        '[{"name":"device_name","desc":"设备名称"},{"name":"device_id","desc":"设备编码"},{"name":"alarm_level","desc":"告警级别"},{"name":"alarm_content","desc":"告警内容"},{"name":"alarm_time","desc":"告警时间"}]',
        TRUE,
        '系统默认 Webhook 告警模板'
    ),
    (
        0,
        'ALARM_IN_APP',
        '告警站内信通知',
        'IN_APP',
        'TEXT',
        '设备告警通知',
        '设备 ${device_name} 于 ${alarm_time} 触发 ${alarm_level} 告警：${alarm_content}',
        '[{"name":"device_name","desc":"设备名称"},{"name":"alarm_time","desc":"告警时间"},{"name":"alarm_level","desc":"告警级别"},{"name":"alarm_content","desc":"告警内容"}]',
        TRUE,
        '系统默认站内信告警模板'
    )
ON CONFLICT (tenant_id, code) DO NOTHING;

DROP TABLE IF EXISTS notification_templates;
