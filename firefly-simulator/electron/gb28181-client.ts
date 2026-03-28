import dgram from 'dgram';
import net from 'net';
import crypto from 'crypto';
import { EventEmitter } from 'events';

// ============================================================
// GB/T 28181 SIP Device Simulator (Enhanced)
// ============================================================
// Features:
// 1. SIP Digest Authentication (RFC 2617 — 401 challenge/response)
// 2. UDP + TCP transport
// 3. UDP retransmission (RFC 3261 Timer A/B)
// 4. Multi-channel support
// 5. REGISTER / Keepalive / Catalog / DeviceInfo / INVITE / BYE

export interface Gb28181Config {
  /** 国标设备编号 (20 位) */
  deviceId: string;
  /** 国标域 (10 位) */
  domain: string;
  /** 设备本地 IP */
  localIp: string;
  /** 设备本地 SIP 端口 */
  localPort: number;
  /** 平台 SIP 服务器 IP */
  serverIp: string;
  /** 平台 SIP 服务器端口 */
  serverPort: number;
  /** 平台 SIP 服务器 ID (20 位) */
  serverId: string;
  /** 注册有效期 (秒) */
  expires: number;
  /** 心跳间隔 (秒) */
  keepaliveInterval: number;
  /** 传输协议 */
  transport: 'UDP' | 'TCP';
  /** SIP 认证密码 (空则不做 Digest Auth) */
  password: string;
  /** 设备厂商 */
  manufacturer: string;
  /** 设备型号 */
  model: string;
  /** 固件版本 */
  firmware: string;
  /** 模拟通道列表 */
  channels: Gb28181Channel[];
}

export interface Gb28181Channel {
  channelId: string;
  name: string;
  manufacturer?: string;
  model?: string;
  status: 'ON' | 'OFF';
  ptzType?: number;
  longitude?: number;
  latitude?: number;
}

export type SipClientEvent =
  | { type: 'registered'; expires: number }
  | { type: 'unregistered' }
  | { type: 'auth_challenge'; realm: string; nonce: string }
  | { type: 'keepalive_sent'; sn: string }
  | { type: 'catalog_response_sent'; channelCount: number }
  | { type: 'device_info_response_sent' }
  | { type: 'invite_accepted'; channelId: string; ssrc: string; rtpIp: string; rtpPort: number }
  | { type: 'bye_accepted' }
  | { type: 'ptz_received'; command: string }
  | { type: 'error'; message: string }
  | { type: 'sip_rx'; method: string; raw: string }
  | { type: 'sip_tx'; method: string; raw: string };

interface PendingTransaction {
  message: string;
  label: string;
  host: string;
  port: number;
  timerA: ReturnType<typeof setTimeout> | null;
  timerB: ReturnType<typeof setTimeout> | null;
  retransmitInterval: number;
  retransmitCount: number;
}

export class Gb28181Client extends EventEmitter {
  private config: Gb28181Config;
  private udpSocket: dgram.Socket | null = null;
  private tcpSocket: net.Socket | null = null;
  private tcpBuffer = '';
  private cseq = 1;
  private callId = '';
  private registerTag = '';
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private reRegisterTimer: ReturnType<typeof setTimeout> | null = null;
  private registered = false;
  private pendingExpires = 0;
  // Digest auth state from last 401 response
  private authRealm = '';
  private authNonce = '';
  // UDP retransmission tracking (branch → transaction)
  private pendingTransactions = new Map<string, PendingTransaction>();

  constructor(config: Gb28181Config) {
    super();
    this.config = config;
  }

  // ==================== Public API ====================

  async start(): Promise<void> {
    if (this.config.transport === 'TCP') {
      return this.startTcp();
    }
    return this.startUdp();
  }

  private startUdp(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.udpSocket = dgram.createSocket('udp4');
      this.udpSocket.on('message', (msg, rinfo) => {
        this.handleIncoming(msg.toString(), rinfo.address, rinfo.port);
      });
      this.udpSocket.on('error', (err) => {
        this.emitEvent({ type: 'error', message: `UDP error: ${err.message}` });
        reject(err);
      });
      this.udpSocket.bind(this.config.localPort, this.config.localIp, () => resolve());
    });
  }

  private startTcp(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.tcpSocket = new net.Socket();
      this.tcpBuffer = '';

      this.tcpSocket.on('data', (data) => {
        this.tcpBuffer += data.toString();
        this.processTcpBuffer();
      });
      this.tcpSocket.on('error', (err) => {
        this.emitEvent({ type: 'error', message: `TCP error: ${err.message}` });
        reject(err);
      });
      this.tcpSocket.on('close', () => {
        this.emitEvent({ type: 'error', message: 'TCP connection closed' });
        this.registered = false;
      });

      this.tcpSocket.connect(this.config.serverPort, this.config.serverIp, () => resolve());
    });
  }

  private processTcpBuffer(): void {
    // SIP over TCP: messages are delimited by Content-Length
    while (this.tcpBuffer.length > 0) {
      const headerEnd = this.tcpBuffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) break;
      const headers = this.tcpBuffer.substring(0, headerEnd);
      const clMatch = headers.match(/Content-Length:\s*(\d+)/i);
      const contentLength = clMatch ? parseInt(clMatch[1], 10) : 0;
      const totalLength = headerEnd + 4 + contentLength;
      if (this.tcpBuffer.length < totalLength) break;

      const message = this.tcpBuffer.substring(0, totalLength);
      this.tcpBuffer = this.tcpBuffer.substring(totalLength);
      this.handleIncoming(message, this.config.serverIp, this.config.serverPort);
    }
  }

  async stop(): Promise<void> {
    this.stopKeepalive();
    this.clearReRegisterTimer();
    this.clearAllTransactions();
    if (this.registered) {
      try { await this.unregister(); } catch { /* ignore */ }
    }
    if (this.udpSocket) { this.udpSocket.close(); this.udpSocket = null; }
    if (this.tcpSocket) { this.tcpSocket.destroy(); this.tcpSocket = null; }
    this.registered = false;
  }

  async register(): Promise<void> {
    this.callId = this.generateCallId();
    this.registerTag = this.generateTag();
    this.cseq = 1;
    this.pendingExpires = this.config.expires;
    this.authRealm = '';
    this.authNonce = '';

    const request = this.buildRegisterRequest(this.config.expires);
    await this.sendSipWithRetransmit(request, 'REGISTER');
  }

  async unregister(): Promise<void> {
    this.pendingExpires = 0;
    const request = this.buildRegisterRequest(0, this.authRealm, this.authNonce);
    // Unregister is best-effort during shutdown/manual stop. Tracking a full UDP
    // transaction here only creates delayed timeout noise after the client has
    // already been marked offline locally.
    await this.sendSip(request, 'REGISTER(unregister)');
    this.registered = false;
    this.clearReRegisterTimer();
    this.emitEvent({ type: 'unregistered' });
  }

  startKeepalive(): void {
    this.stopKeepalive();
    this.keepaliveTimer = setInterval(() => this.sendKeepalive(), this.config.keepaliveInterval * 1000);
    this.sendKeepalive();
  }

  stopKeepalive(): void {
    if (this.keepaliveTimer) { clearInterval(this.keepaliveTimer); this.keepaliveTimer = null; }
  }

  isRegistered(): boolean { return this.registered; }

  updateChannels(channels: Gb28181Channel[]): void {
    this.config.channels = channels;
  }

  // ==================== SIP Digest Authentication (RFC 2617) ====================

  private computeDigestResponse(method: string, uri: string, realm: string, nonce: string, password: string): string {
    const username = this.config.deviceId;
    const ha1 = crypto.createHash('md5').update(`${username}:${realm}:${password}`).digest('hex');
    const ha2 = crypto.createHash('md5').update(`${method}:${uri}`).digest('hex');
    return crypto.createHash('md5').update(`${ha1}:${nonce}:${ha2}`).digest('hex');
  }

  private buildAuthorizationHeader(method: string, uri: string, realm: string, nonce: string): string {
    const username = this.config.deviceId;
    const response = this.computeDigestResponse(method, uri, realm, nonce, this.config.password);
    return `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}", algorithm=MD5`;
  }

  private parseWwwAuthenticate(headerValue: string): { realm: string; nonce: string } {
    const realmMatch = headerValue.match(/realm="([^"]+)"/);
    const nonceMatch = headerValue.match(/nonce="([^"]+)"/);
    return {
      realm: realmMatch ? realmMatch[1] : '',
      nonce: nonceMatch ? nonceMatch[1] : '',
    };
  }

  // ==================== SIP Message Builders ====================

  private get transportTag(): string { return this.config.transport; }

  private buildRegisterRequest(expires: number, realm?: string, nonce?: string): string {
    const { deviceId, domain, localIp, localPort, serverIp, serverPort, serverId } = this.config;
    const branch = this.generateBranch();
    const tag = this.registerTag;
    const uri = `sip:${serverId}@${serverIp}:${serverPort}`;

    const lines = [
      `REGISTER ${uri} SIP/2.0`,
      `Via: SIP/2.0/${this.transportTag} ${localIp}:${localPort};rport;branch=${branch}`,
      `From: <sip:${deviceId}@${domain}>;tag=${tag}`,
      `To: <sip:${deviceId}@${domain}>`,
      `Call-ID: ${this.callId}`,
      `CSeq: ${this.cseq++} REGISTER`,
      `Contact: <sip:${deviceId}@${localIp}:${localPort};transport=${this.transportTag.toLowerCase()}>`,
      `Max-Forwards: 70`,
      `User-Agent: Firefly-Simulator/1.0`,
      `Expires: ${expires}`,
    ];
    if (realm && nonce && this.config.password) {
      lines.push(`Authorization: ${this.buildAuthorizationHeader('REGISTER', uri, realm, nonce)}`);
    }
    lines.push(`Content-Length: 0`, ``, ``);
    return lines.join('\r\n');
  }

  private sendKeepalive(): void {
    const sn = this.generateSn();
    const xml = [
      `<?xml version="1.0" encoding="GB2312"?>`,
      `<Notify>`,
      `<CmdType>Keepalive</CmdType>`,
      `<SN>${sn}</SN>`,
      `<DeviceID>${this.config.deviceId}</DeviceID>`,
      `<Status>OK</Status>`,
      `</Notify>`,
    ].join('\r\n');

    const message = this.buildMessageRequest(xml);
    this.sendSip(message, 'MESSAGE(Keepalive)');
    this.emitEvent({ type: 'keepalive_sent', sn });
  }

  private buildMessageRequest(xmlContent: string): string {
    const { deviceId, domain, localIp, localPort, serverIp, serverPort, serverId } = this.config;
    const branch = this.generateBranch();
    const tag = this.generateTag();
    const callId = this.generateCallId();
    const contentBytes = Buffer.byteLength(xmlContent, 'utf-8');

    return [
      `MESSAGE sip:${serverId}@${serverIp}:${serverPort} SIP/2.0`,
      `Via: SIP/2.0/${this.transportTag} ${localIp}:${localPort};rport;branch=${branch}`,
      `From: <sip:${deviceId}@${domain}>;tag=${tag}`,
      `To: <sip:${serverId}@${domain}>`,
      `Call-ID: ${callId}`,
      `CSeq: ${this.cseq++} MESSAGE`,
      `Content-Type: Application/MANSCDP+xml`,
      `Max-Forwards: 70`,
      `User-Agent: Firefly-Simulator/1.0`,
      `Content-Length: ${contentBytes}`,
      ``,
      xmlContent,
    ].join('\r\n');
  }

  private buildCatalogResponse(sn: string): string {
    const { channels, deviceId } = this.config;
    const items = channels.map((ch) => {
      let item = `<Item>\r\n<DeviceID>${ch.channelId}</DeviceID>\r\n<Name>${ch.name}</Name>\r\n`;
      if (ch.manufacturer) item += `<Manufacturer>${ch.manufacturer}</Manufacturer>\r\n`;
      if (ch.model) item += `<Model>${ch.model}</Model>\r\n`;
      item += `<Status>${ch.status}</Status>\r\n`;
      if (ch.ptzType !== undefined) item += `<PTZType>${ch.ptzType}</PTZType>\r\n`;
      if (ch.longitude !== undefined) item += `<Longitude>${ch.longitude}</Longitude>\r\n`;
      if (ch.latitude !== undefined) item += `<Latitude>${ch.latitude}</Latitude>\r\n`;
      item += `</Item>`;
      return item;
    }).join('\r\n');

    return [
      `<?xml version="1.0" encoding="GB2312"?>`,
      `<Response>`,
      `<CmdType>Catalog</CmdType>`,
      `<SN>${sn}</SN>`,
      `<DeviceID>${deviceId}</DeviceID>`,
      `<SumNum>${channels.length}</SumNum>`,
      `<DeviceList Num="${channels.length}">`,
      items,
      `</DeviceList>`,
      `</Response>`,
    ].join('\r\n');
  }

  private buildDeviceInfoResponse(sn: string): string {
    const { deviceId, manufacturer, model, firmware, channels } = this.config;
    return [
      `<?xml version="1.0" encoding="GB2312"?>`,
      `<Response>`,
      `<CmdType>DeviceInfo</CmdType>`,
      `<SN>${sn}</SN>`,
      `<DeviceID>${deviceId}</DeviceID>`,
      `<DeviceName>Firefly-Sim-${deviceId.slice(-4)}</DeviceName>`,
      `<Manufacturer>${manufacturer}</Manufacturer>`,
      `<Model>${model}</Model>`,
      `<Firmware>${firmware}</Firmware>`,
      `<Channel>${channels.length}</Channel>`,
      `</Response>`,
    ].join('\r\n');
  }

  private buildSipResponse(request: string, statusCode: number, reasonPhrase: string, extraHeaders?: string[], body?: string, bodyType?: string): string {
    const via = this.extractHeader(request, 'Via');
    const from = this.extractHeader(request, 'From');
    let to = this.extractHeader(request, 'To');
    const callId = this.extractHeader(request, 'Call-ID');
    const cseq = this.extractHeader(request, 'CSeq');
    if (!to.includes('tag=')) to = `${to};tag=${this.generateTag()}`;

    const lines = [
      `SIP/2.0 ${statusCode} ${reasonPhrase}`,
      `Via: ${via}`,
      `From: ${from}`,
      `To: ${to}`,
      `Call-ID: ${callId}`,
      `CSeq: ${cseq}`,
      `User-Agent: Firefly-Simulator/1.0`,
    ];
    if (extraHeaders) lines.push(...extraHeaders);
    if (body && bodyType) {
      const contentBytes = Buffer.byteLength(body, 'utf-8');
      lines.push(`Content-Type: ${bodyType}`, `Content-Length: ${contentBytes}`, ``, body);
    } else {
      lines.push(`Content-Length: 0`, ``, ``);
    }
    return lines.join('\r\n');
  }

  // ==================== Incoming Message Handler ====================

  private handleIncoming(data: string, fromIp: string, fromPort: number): void {
    const firstLine = data.split('\r\n')[0] || data.split('\n')[0];
    if (firstLine.startsWith('SIP/2.0')) {
      this.handleSipResponse(data, firstLine);
    } else {
      this.handleSipRequest(data, firstLine, fromIp, fromPort);
    }
  }

  private handleSipResponse(data: string, statusLine: string): void {
    const parts = statusLine.split(' ');
    const statusCode = parseInt(parts[1], 10);
    const cseqLine = this.extractHeader(data, 'CSeq');

    // Cancel retransmission for matching Via branch
    const viaBranch = this.extractViaBranch(data);
    if (viaBranch) this.cancelTransaction(viaBranch);

    this.emitEvent({ type: 'sip_rx', method: `${statusCode} (${cseqLine})`, raw: data });

    if (cseqLine.includes('REGISTER')) {
      if (statusCode === 401 || statusCode === 407) {
        // Digest auth challenge
        const wwwAuth = this.extractHeader(data, statusCode === 401 ? 'WWW-Authenticate' : 'Proxy-Authenticate');
        if (wwwAuth && this.config.password) {
          const { realm, nonce } = this.parseWwwAuthenticate(wwwAuth);
          this.authRealm = realm;
          this.authNonce = nonce;
          this.emitEvent({ type: 'auth_challenge', realm, nonce });
          // Resend REGISTER with credentials
          const authRequest = this.buildRegisterRequest(this.pendingExpires, realm, nonce);
          this.sendSipWithRetransmit(authRequest, 'REGISTER(auth)');
        } else {
          this.emitEvent({ type: 'error', message: `Auth required but no password configured (${statusCode})` });
        }
      } else if (statusCode === 200) {
        this.registered = this.pendingExpires > 0;
        if (this.registered) {
          this.emitEvent({ type: 'registered', expires: this.pendingExpires });
          this.scheduleReRegister();
        } else {
          this.emitEvent({ type: 'unregistered' });
        }
      } else {
        this.emitEvent({ type: 'error', message: `REGISTER failed: ${statusCode} ${parts.slice(2).join(' ')}` });
      }
    }
  }

  private handleSipRequest(data: string, requestLine: string, fromIp: string, fromPort: number): void {
    const method = requestLine.split(' ')[0];
    this.emitEvent({ type: 'sip_rx', method, raw: data });

    switch (method) {
      case 'MESSAGE':
        this.handleMessageRequest(data, fromIp, fromPort);
        break;
      case 'INVITE':
        this.handleInviteRequest(data, fromIp, fromPort);
        break;
      case 'BYE':
        this.handleByeRequest(data, fromIp, fromPort);
        break;
      case 'ACK':
        break;
      default: {
        const ok = this.buildSipResponse(data, 200, 'OK');
        this.sendRaw(ok, fromIp, fromPort);
      }
    }
  }

  private handleMessageRequest(data: string, fromIp: string, fromPort: number): void {
    const ok = this.buildSipResponse(data, 200, 'OK');
    this.sendRaw(ok, fromIp, fromPort);

    const bodyStart = data.indexOf('<?xml');
    if (bodyStart < 0) return;
    const xmlBody = data.substring(bodyStart);
    const cmdType = this.extractXmlElement(xmlBody, 'CmdType');
    const sn = this.extractXmlElement(xmlBody, 'SN') || this.generateSn();

    if (cmdType === 'Catalog') {
      const catalogXml = this.buildCatalogResponse(sn);
      const responseMessage = this.buildMessageRequest(catalogXml);
      this.sendSip(responseMessage, 'MESSAGE(CatalogResponse)');
      this.emitEvent({ type: 'catalog_response_sent', channelCount: this.config.channels.length });
    } else if (cmdType === 'DeviceInfo') {
      const infoXml = this.buildDeviceInfoResponse(sn);
      const responseMessage = this.buildMessageRequest(infoXml);
      this.sendSip(responseMessage, 'MESSAGE(DeviceInfoResponse)');
      this.emitEvent({ type: 'device_info_response_sent' });
    } else if (cmdType === 'DeviceControl') {
      const ptzCmd = this.extractXmlElement(xmlBody, 'PTZCmd');
      this.emitEvent({ type: 'ptz_received', command: ptzCmd || 'unknown' });
    }
  }

  private handleInviteRequest(data: string, fromIp: string, fromPort: number): void {
    // Send 100 Trying first
    const trying = this.buildSipResponse(data, 100, 'Trying');
    this.sendRaw(trying, fromIp, fromPort);

    // Extract SDP
    const sdpStart = data.indexOf('v=0');
    let ssrc = '0000000000';
    if (sdpStart >= 0) {
      const sdp = data.substring(sdpStart);
      const yMatch = sdp.match(/y=(\d+)/);
      if (yMatch) ssrc = yMatch[1];
    }

    const requestLine = data.split('\r\n')[0];
    const uriMatch = requestLine.match(/sip:(\d+)@/);
    const channelId = uriMatch ? uriMatch[1] : this.config.deviceId;
    let rtpIp = fromIp;
    let rtpPort = 0;
    if (sdpStart >= 0) {
      const sdp = data.substring(sdpStart);
      const cMatch = sdp.match(/c=IN IP4 ([^\r\n]+)/i);
      if (cMatch && cMatch[1]) {
        rtpIp = cMatch[1].trim();
      }
      const mMatch = sdp.match(/m=video (\d+)/i);
      if (mMatch && mMatch[1]) {
        rtpPort = Number(mMatch[1]);
      }
    }
    if (!Number.isInteger(rtpPort) || rtpPort <= 0 || rtpPort > 65535) {
      rtpPort = fromPort;
    }

    const { localIp, deviceId } = this.config;
    const deviceRtpPort = 20000 + Math.floor(Math.random() * 10000);
    const responseSdp = [
      `v=0`,
      `o=${channelId} 0 0 IN IP4 ${localIp}`,
      `s=Play`,
      `c=IN IP4 ${localIp}`,
      `t=0 0`,
      `m=video ${deviceRtpPort} RTP/AVP 96`,
      `a=sendonly`,
      `a=rtpmap:96 PS/90000`,
      `y=${ssrc}`,
    ].join('\r\n') + '\r\n';

    const contact = `Contact: <sip:${deviceId}@${localIp}:${this.config.localPort}>`;
    const response = this.buildSipResponse(data, 200, 'OK', [contact], responseSdp, 'application/sdp');
    this.sendRaw(response, fromIp, fromPort);
    this.emitEvent({ type: 'invite_accepted', channelId, ssrc, rtpIp, rtpPort });
  }

  private handleByeRequest(data: string, fromIp: string, fromPort: number): void {
    const ok = this.buildSipResponse(data, 200, 'OK');
    this.sendRaw(ok, fromIp, fromPort);
    this.emitEvent({ type: 'bye_accepted' });
  }

  // ==================== Re-registration ====================

  private scheduleReRegister(): void {
    this.clearReRegisterTimer();
    // Re-register at 80% of expires to avoid expiry
    const delay = Math.max(this.config.expires * 0.8, 30) * 1000;
    this.reRegisterTimer = setTimeout(async () => {
      if (!this.registered) return;
      this.pendingExpires = this.config.expires;
      const req = this.buildRegisterRequest(this.config.expires, this.authRealm, this.authNonce);
      this.sendSipWithRetransmit(req, 'REGISTER(refresh)');
    }, delay);
  }

  private clearReRegisterTimer(): void {
    if (this.reRegisterTimer) { clearTimeout(this.reRegisterTimer); this.reRegisterTimer = null; }
  }

  // ==================== UDP Retransmission (RFC 3261 §17.1.1.2) ====================

  private async sendSipWithRetransmit(message: string, label: string): Promise<void> {
    this.emitEvent({ type: 'sip_tx', method: label, raw: message });
    const { serverIp, serverPort } = this.config;
    await this.sendRaw(message, serverIp, serverPort);

    if (this.config.transport === 'UDP') {
      const branch = this.extractViaBranch(message);
      if (branch) {
        const T1 = 500; // ms
        const txn: PendingTransaction = {
          message, label, host: serverIp, port: serverPort,
          timerA: null, timerB: null,
          retransmitInterval: T1, retransmitCount: 0,
        };
        // Timer B (transaction timeout) = 64 * T1 = 32s
        txn.timerB = setTimeout(() => {
          this.cancelTransaction(branch);
          this.emitEvent({ type: 'error', message: `${label} transaction timeout (32s)` });
        }, 64 * T1);
        // Timer A (retransmission)
        const scheduleRetransmit = () => {
          txn.timerA = setTimeout(async () => {
            if (!this.pendingTransactions.has(branch)) return;
            txn.retransmitCount++;
            await this.sendRaw(txn.message, txn.host, txn.port);
            txn.retransmitInterval = Math.min(txn.retransmitInterval * 2, 4000);
            scheduleRetransmit();
          }, txn.retransmitInterval);
        };
        this.pendingTransactions.set(branch, txn);
        scheduleRetransmit();
      }
    }
  }

  private cancelTransaction(branch: string): void {
    const txn = this.pendingTransactions.get(branch);
    if (txn) {
      if (txn.timerA) clearTimeout(txn.timerA);
      if (txn.timerB) clearTimeout(txn.timerB);
      this.pendingTransactions.delete(branch);
    }
  }

  private clearAllTransactions(): void {
    const branches = Array.from(this.pendingTransactions.keys());
    branches.forEach((branch) => this.cancelTransaction(branch));
  }

  private extractViaBranch(sipMessage: string): string | null {
    const via = this.extractHeader(sipMessage, 'Via');
    const match = via.match(/branch=(z9hG4bK[^\s;,]+)/);
    return match ? match[1] : null;
  }

  // ==================== Transport ====================

  private async sendSip(message: string, label: string): Promise<void> {
    this.emitEvent({ type: 'sip_tx', method: label, raw: message });
    await this.sendRaw(message, this.config.serverIp, this.config.serverPort);
  }

  private sendRaw(message: string, host: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const buf = Buffer.from(message, 'utf-8');
      if (this.config.transport === 'TCP' && this.tcpSocket) {
        this.tcpSocket.write(buf, (err) => { if (err) reject(err); else resolve(); });
      } else if (this.udpSocket) {
        this.udpSocket.send(buf, 0, buf.length, port, host, (err) => { if (err) reject(err); else resolve(); });
      } else {
        reject(new Error('No socket available'));
      }
    });
  }

  // ==================== Utilities ====================

  private emitEvent(evt: SipClientEvent): void {
    this.emit('event', evt);
  }

  private extractHeader(sipMessage: string, headerName: string): string {
    const lines = sipMessage.split('\r\n');
    const lower = headerName.toLowerCase();
    for (const line of lines) {
      if (line.toLowerCase().startsWith(lower + ':')) {
        return line.substring(headerName.length + 1).trim();
      }
    }
    return '';
  }

  private extractXmlElement(xml: string, tagName: string): string | null {
    const regex = new RegExp(`<${tagName}>(.*?)</${tagName}>`, 's');
    const match = xml.match(regex);
    return match ? match[1].trim() : null;
  }

  private generateBranch(): string {
    return 'z9hG4bK' + Math.random().toString(36).substring(2, 12);
  }

  private generateTag(): string {
    return Math.random().toString(36).substring(2, 10);
  }

  private generateCallId(): string {
    return Math.random().toString(36).substring(2, 14) + '@' + this.config.localIp;
  }

  private generateSn(): string {
    return String(Math.floor(Math.random() * 900000 + 100000));
  }
}
