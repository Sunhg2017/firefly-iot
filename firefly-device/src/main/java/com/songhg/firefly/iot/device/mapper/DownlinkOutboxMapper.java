package com.songhg.firefly.iot.device.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.songhg.firefly.iot.device.entity.DownlinkOutbox;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface DownlinkOutboxMapper extends BaseMapper<DownlinkOutbox> {

    /**
     * 幂等写入：同一下行消息（device_id + message_id 唯一）只保留一条 outbox 记录。
     *
     * @return 实际插入行数（0 表示已存在）
     */
    int insertIgnore(DownlinkOutbox outbox);
}
