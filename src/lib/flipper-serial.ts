// src/lib/flipper-serial.ts
// Web Serial API abstraction for Flipper Zero — baud 230400, Chrome/Edge only.
// Self-contained Web Serial type declarations so no extra @types package is needed.

// ── Minimal Web Serial API type declarations ──────────────────────────────────
interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

interface SerialPortFilter {
  usbVendorId?: number;
  usbProductId?: number;
}

interface SerialOptions {
  baudRate: number;
  dataBits?: number;
  stopBits?: number;
  parity?: string;
  bufferSize?: number;
  flowControl?: string;
}

interface SerialPort {
  open(options: SerialOptions): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  getInfo(): SerialPortInfo;
}

interface Serial {
  requestPort(options?: { filters?: SerialPortFilter[] }): Promise<SerialPort>;
  getPorts(): Promise<SerialPort[]>;
}

declare global {
  interface Navigator {
    serial: Serial;
  }
}
// ─────────────────────────────────────────────────────────────────────────────

export interface FlipperResponse {
  raw: string;
  lines: string[];
  success: boolean;
  error?: string;
}

export interface FlipperDeviceInfo {
  name?: string;
  firmware?: string;
  hardware?: string;
  battery?: string;
  sdCard?: string;
}

const BAUD_RATE = 230400;
const DEFAULT_TIMEOUT_MS = 8000;
const PROMPT_TOKEN = '>: ';

class FlipperSerial {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();
  private _connected = false;
  private _pending = '';

  get connected(): boolean {
    return this._connected;
  }

  async connect(): Promise<void> {
    if (!('serial' in navigator)) {
      throw new Error(
        'Web Serial API is not supported. Please use Chrome or Edge (desktop).'
      );
    }

    this.port = await navigator.serial.requestPort({
      filters: [{ usbVendorId: 0x0483 }],
    });

    await this.port.open({ baudRate: BAUD_RATE });

    if (!this.port.readable || !this.port.writable) {
      throw new Error('Serial port streams not available.');
    }

    this.writer = this.port.writable.getWriter();
    this.reader = this.port.readable.getReader();
    this._connected = true;

    await this._sendRaw('\r\n');
    await this._drainUntilPrompt(1500);
  }

  async disconnect(): Promise<void> {
    try {
      if (this.reader) {
        await this.reader.cancel().catch(() => undefined);
        this.reader.releaseLock();
      }
      if (this.writer) {
        await this.writer.close().catch(() => undefined);
        this.writer.releaseLock();
      }
      await this.port?.close();
    } finally {
      this.reader = null;
      this.writer = null;
      this.port = null;
      this._connected = false;
      this._pending = '';
    }
  }

  async sendCommand(
    cmd: string,
    timeoutMs = DEFAULT_TIMEOUT_MS
  ): Promise<FlipperResponse> {
    if (!this._connected || !this.writer || !this.reader) {
      throw new Error('Flipper Zero is not connected.');
    }
    await this._sendRaw(cmd + '\r\n');
    const raw = await this._drainUntilPrompt(timeoutMs);
    return this._parseResponse(raw);
  }

  async writeFile(path: string, content: string): Promise<FlipperResponse> {
    if (!this._connected || !this.writer || !this.reader) {
      throw new Error('Flipper Zero is not connected.');
    }
    await this._sendRaw(`storage write ${path}\r\n`);
    await this._sleep(150);
    await this._sendRaw(content);
    await this._sleep(80);
    await this.writer.write(new Uint8Array([0x03]));
    const raw = await this._drainUntilPrompt(5000);
    return this._parseResponse(raw);
  }

  parseDeviceInfo(raw: string): FlipperDeviceInfo {
    const info: FlipperDeviceInfo = {};
    for (const line of raw.split('\n')) {
      const l = line.toLowerCase();
      const val = (): string => line.split(':').slice(1).join(':').trim();
      if (l.includes('fw version') || l.includes('firmware_version')) info.firmware = val();
      if (l.includes('hw version') || l.includes('hardware_version')) info.hardware = val();
      if (l.includes('charge_level') || l.includes('battery')) info.battery = val();
      if (l.includes('flipper_name') || (l.includes('name') && !l.includes('file'))) info.name = val();
      if (l.includes('sd') && l.includes('free')) info.sdCard = val();
    }
    return info;
  }

  // ── internals ───────────────────────────────────────────────────────────────

  private async _sendRaw(text: string): Promise<void> {
    await this.writer!.write(this.encoder.encode(text));
  }

  private async _drainUntilPrompt(timeoutMs: number): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    let buf = this._pending;
    this._pending = '';

    while (Date.now() < deadline) {
      if (buf.includes(PROMPT_TOKEN)) break;
      const remaining = Math.max(10, deadline - Date.now());
      const chunk = await this._readChunk(Math.min(remaining, 300));
      buf += chunk;
    }

    const promptIdx = buf.lastIndexOf(PROMPT_TOKEN);
    if (promptIdx !== -1) {
      this._pending = buf.slice(promptIdx + PROMPT_TOKEN.length);
      buf = buf.slice(0, promptIdx + PROMPT_TOKEN.length);
    }
    return buf;
  }

  private async _readChunk(timeoutMs: number): Promise<string> {
    if (!this.reader) return '';

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const timeoutPromise = new Promise<ReadableStreamReadResult<Uint8Array>>(
      (resolve) => {
        timeoutId = setTimeout(
          () => resolve({ value: undefined, done: true }),
          timeoutMs
        );
      }
    );

    try {
      const result = await Promise.race([this.reader.read(), timeoutPromise]);
      if (timeoutId !== null) clearTimeout(timeoutId);
      if (result.done || result.value === undefined) return '';
      return this.decoder.decode(result.value);
    } catch {
      if (timeoutId !== null) clearTimeout(timeoutId);
      return '';
    }
  }

  private _parseResponse(raw: string): FlipperResponse {
    const cleaned = this._stripAnsi(raw);
    const lines = cleaned
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('>:'));

    const lower = cleaned.toLowerCase();
    const success =
      !lower.includes('error') &&
      !lower.includes('not found') &&
      !lower.includes('failed') &&
      !lower.includes('invalid');

    const error = success
      ? undefined
      : lines.find((l) => /error|failed|invalid|not found/i.test(l));

    return { raw: cleaned, lines, success, error };
  }

  private _stripAnsi(s: string): string {
    return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}

export const flipperSerial = new FlipperSerial();

// ── High-level command helpers ─────────────────────────────────────────────

export async function flipperGetInfo(): Promise<FlipperDeviceInfo & { raw: string }> {
  const d = await flipperSerial.sendCommand('info device');
  const p = await flipperSerial.sendCommand('info power');
  const info = flipperSerial.parseDeviceInfo(d.raw + p.raw);
  const batt = p.raw.match(/charge_level:\s*(\d+)/i);
  if (batt) info.battery = batt[1] + '%';
  return { ...info, raw: d.raw + '\n' + p.raw };
}

export async function flipperStorageList(path = '/ext'): Promise<FlipperResponse> {
  return flipperSerial.sendCommand(`storage list ${path}`);
}

export async function flipperStorageRead(path: string): Promise<FlipperResponse> {
  return flipperSerial.sendCommand(`storage read ${path}`, 5000);
}

export async function flipperStorageWrite(path: string, content: string): Promise<FlipperResponse> {
  return flipperSerial.writeFile(path, content);
}

export async function flipperStorageRemove(path: string): Promise<FlipperResponse> {
  return flipperSerial.sendCommand(`storage remove ${path}`);
}

export async function flipperStorageMkdir(path: string): Promise<FlipperResponse> {
  return flipperSerial.sendCommand(`storage mkdir ${path}`);
}

export async function flipperStorageStat(path: string): Promise<FlipperResponse> {
  return flipperSerial.sendCommand(`storage stat ${path}`);
}

export async function flipperStorageTree(path = '/ext'): Promise<FlipperResponse> {
  return flipperSerial.sendCommand(`storage tree ${path}`, 10000);
}

export async function flipperSubGhzRx(freqHz: number, device = 0): Promise<FlipperResponse> {
  return flipperSerial.sendCommand(`subghz rx ${freqHz} ${device}`, 15000);
}

export async function flipperSubGhzTx(
  keyHex: string, freqHz: number, te: number, repeat: number, device = 0
): Promise<FlipperResponse> {
  return flipperSerial.sendCommand(`subghz tx ${keyHex} ${freqHz} ${te} ${repeat} ${device}`, 10000);
}

export async function flipperSubGhzTxFile(path: string, repeat = 1, device = 0): Promise<FlipperResponse> {
  return flipperSerial.sendCommand(`subghz tx_from_file ${path} ${repeat} ${device}`, 15000);
}

export async function flipperSubGhzDecodeRaw(path: string): Promise<FlipperResponse> {
  return flipperSerial.sendCommand(`subghz decode_raw ${path}`, 10000);
}

export async function flipperIrRx(raw = false): Promise<FlipperResponse> {
  return flipperSerial.sendCommand(raw ? 'ir rx raw' : 'ir rx', 15000);
}

export async function flipperIrTx(
  protocol: string, address: string, command: string
): Promise<FlipperResponse> {
  return flipperSerial.sendCommand(`ir tx ${protocol} ${address} ${command}`, 8000);
}

export async function flipperIrUniversal(remote: string, signal: string): Promise<FlipperResponse> {
  return flipperSerial.sendCommand(`ir universal ${remote} ${signal}`, 8000);
}

export async function flipperIrUniversalList(remote: string): Promise<FlipperResponse> {
  return flipperSerial.sendCommand(`ir universal list ${remote}`);
}

export async function flipperNfcDetect(): Promise<FlipperResponse> {
  return flipperSerial.sendCommand('nfc dump', 12000);
}

export async function flipperNfcEmulate(path: string): Promise<FlipperResponse> {
  return flipperSerial.sendCommand(`nfc emulate ${path}`, 12000);
}

export async function flipperRfidRead(): Promise<FlipperResponse> {
  return flipperSerial.sendCommand('rfid read', 12000);
}

export async function flipperRfidEmulate(keyType: string, keyData: string): Promise<FlipperResponse> {
  return flipperSerial.sendCommand(`rfid emulate ${keyType} ${keyData}`, 10000);
}

export async function flipperRfidWrite(keyType: string, keyData: string): Promise<FlipperResponse> {
  return flipperSerial.sendCommand(`rfid write ${keyType} ${keyData}`, 12000);
}

export async function flipperIButtonRead(): Promise<FlipperResponse> {
  return flipperSerial.sendCommand('ikey read', 12000);
}

export async function flipperIButtonEmulate(keyType: string, keyData: string): Promise<FlipperResponse> {
  return flipperSerial.sendCommand(`ikey emulate ${keyType} ${keyData}`, 10000);
}

export async function flipperIButtonWrite(keyData: string): Promise<FlipperResponse> {
  return flipperSerial.sendCommand(`ikey write dallas ${keyData}`, 12000);
}

export async function flipperGpioMode(pin: string, mode: 0 | 1): Promise<FlipperResponse> {
  return flipperSerial.sendCommand(`gpio mode ${pin} ${mode}`);
}

export async function flipperGpioSet(pin: string, value: 0 | 1): Promise<FlipperResponse> {
  return flipperSerial.sendCommand(`gpio set ${pin} ${value}`);
}

export async function flipperGpioRead(pin: string): Promise<FlipperResponse> {
  return flipperSerial.sendCommand(`gpio read ${pin}`);
}

export async function flipperLoaderList(): Promise<FlipperResponse> {
  return flipperSerial.sendCommand('loader list');
}

export async function flipperLoaderOpen(appName: string): Promise<FlipperResponse> {
  return flipperSerial.sendCommand(`loader open "${appName}"`, 8000);
}

export async function flipperLoaderClose(): Promise<FlipperResponse> {
  return flipperSerial.sendCommand('loader close');
}

export async function flipperInputSend(key: string, type: string): Promise<FlipperResponse> {
  return flipperSerial.sendCommand(`input send ${key} ${type}`);
}

export async function flipperLed(r: number, g: number, b: number): Promise<void> {
  await flipperSerial.sendCommand(`led r ${r}`);
  await flipperSerial.sendCommand(`led g ${g}`);
  await flipperSerial.sendCommand(`led b ${b}`);
}

export async function flipperVibro(on: boolean): Promise<FlipperResponse> {
  return flipperSerial.sendCommand(`vibro ${on ? 1 : 0}`);
}

export async function flipperBuzzer(freq: number, durationMs: number): Promise<FlipperResponse> {
  return flipperSerial.sendCommand(`buzzer freq ${freq} ${durationMs}ms`);
}

export async function flipperBuzzerNote(note: string, durationMs: number): Promise<FlipperResponse> {
  return flipperSerial.sendCommand(`buzzer note ${note} ${durationMs}ms`);
}

export async function flipperPower(action: 'off' | 'reboot' | 'reboot2dfu'): Promise<FlipperResponse> {
  return flipperSerial.sendCommand(`power ${action}`);
}

export async function flipperRaw(cmd: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<FlipperResponse> {
  return flipperSerial.sendCommand(cmd, timeoutMs);
}
