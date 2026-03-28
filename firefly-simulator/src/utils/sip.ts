import type { SimDevice, SipChannel } from '../store';

function buildDefaultSipChannel(device: Pick<SimDevice, 'gbDeviceId' | 'name'>): SipChannel {
  return {
    channelId: device.gbDeviceId.slice(0, 14) + '131' + device.gbDeviceId.slice(17),
    name: `模拟通道-${device.name}`,
    manufacturer: 'Firefly-Simulator',
    model: 'VCam-1080P',
    status: 'ON',
    ptzType: 1,
    longitude: 116.397428,
    latitude: 39.90923,
  };
}

export function resolveSimulatorSipChannels(
  device: Pick<SimDevice, 'gbDeviceId' | 'name' | 'sipChannels'>,
): SipChannel[] {
  return device.sipChannels.length > 0 ? device.sipChannels : [buildDefaultSipChannel(device)];
}

export function buildSimulatorSipStartConfig(device: SimDevice) {
  return {
    deviceId: device.gbDeviceId,
    domain: device.gbDomain,
    localIp: '127.0.0.1',
    localPort: device.sipLocalPort,
    serverIp: device.sipServerIp,
    serverPort: device.sipServerPort,
    serverId: device.sipServerId,
    expires: 3600,
    keepaliveInterval: device.sipKeepaliveInterval,
    transport: device.sipTransport,
    password: device.sipPassword,
    manufacturer: 'Firefly-Simulator',
    model: 'Virtual-Camera',
    firmware: '1.0.0',
    enableLocalMedia: device.videoSourceType === 'LOCAL_CAMERA',
    mediaFps: device.mediaFps,
    mediaWidth: device.mediaWidth,
    mediaHeight: device.mediaHeight,
    cameraDevice: device.cameraDevice,
    channels: resolveSimulatorSipChannels(device),
  };
}
