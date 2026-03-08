package com.songhg.firefly.iot.media.gb28181;

import com.songhg.firefly.iot.common.enums.PtzCommand;

/**
 * GB/T 28181 PTZ 控制指令构造器
 * <p>
 * 指令格式 (8 字节 / 16 位十六进制):
 * A5 0F 01 [组合码1] [组合码2] [组合码3] 00 [校验码]
 * <p>
 * 组合码1 (Byte3): 高4位=镜头控制, 低4位=云台控制
 *   - Bit7: 缩小(Zoom Out)
 *   - Bit6: 放大(Zoom In)
 *   - Bit5: 上
 *   - Bit4: 下
 *   - Bit3: 左
 *   - Bit2: 右
 * <p>
 * 组合码2 (Byte4): 水平速度 (0x00~0xFF)
 * 组合码3 (Byte5): 垂直速度 (0x00~0xFF) 高4位 + Zoom速度低4位
 * <p>
 * 校验码 = (Byte1 + Byte2 + ... + Byte7) % 256
 */
public class PtzCommandBuilder {

    private static final int BYTE0 = 0xA5;
    private static final int BYTE1 = 0x0F;
    private static final int BYTE2 = 0x01;

    /**
     * 构造 PTZ 控制指令
     *
     * @param command PTZ 方向/变焦指令
     * @param speed   速度 (1-255)
     * @return 16 位十六进制字符串 (如 "A50F01020000000058")
     */
    public static String build(PtzCommand command, int speed) {
        if (speed < 0) speed = 0;
        if (speed > 255) speed = 255;

        int byte3 = 0; // 组合码1
        int byte4 = 0; // 水平速度
        int byte5 = 0; // 垂直速度
        int byte6 = 0;

        switch (command) {
            case UP:
                byte3 = 0x08;
                byte5 = speed;
                break;
            case DOWN:
                byte3 = 0x04;
                byte5 = speed;
                break;
            case LEFT:
                byte3 = 0x02;
                byte4 = speed;
                break;
            case RIGHT:
                byte3 = 0x01;
                byte4 = speed;
                break;
            case ZOOM_IN:
                byte3 = 0x10;
                byte5 = (speed & 0x0F) << 4;
                break;
            case ZOOM_OUT:
                byte3 = 0x20;
                byte5 = (speed & 0x0F) << 4;
                break;
            case STOP:
            default:
                // 全 0 = 停止
                break;
        }

        int checksum = (BYTE0 + BYTE1 + BYTE2 + byte3 + byte4 + byte5 + byte6) % 256;

        return String.format("%02X%02X%02X%02X%02X%02X%02X%02X",
                BYTE0, BYTE1, BYTE2, byte3, byte4, byte5, byte6, checksum);
    }

    /**
     * 构造 PTZ 停止指令
     */
    public static String buildStop() {
        return build(PtzCommand.STOP, 0);
    }
}
