package com.songhg.firefly.iot.media.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.songhg.firefly.iot.media.entity.VideoRecording;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface VideoRecordingMapper extends BaseMapper<VideoRecording> {

    /**
     * 幂等写入：同一 ZLM 录制文件（file_path 唯一）只保留一条元数据，
     * 避免 on_record_mp4 webhook 因重试重复投递时产生重复记录。
     *
     * @return 实际插入行数（0 表示已存在，被 ON CONFLICT DO NOTHING 忽略）
     */
    int insertIgnore(VideoRecording recording);
}
