/** SMTP transport using the Node runtime's TLS socket; no queue or mail package. */
import tls from 'node:tls';
import type { EmailMessage, EmailTransport } from '../application/index';

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
}

const EMAIL = /^[^\s<>@\r\n]+@[^\s<>@\r\n]+\.[^\s<>@\r\n]+$/;

export function smtpConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SmtpConfig {
  const host = env.SMTP_HOST?.trim();
  const port = Number(env.SMTP_PORT ?? '465');
  const user = env.SMTP_USER;
  const password = env.SMTP_PASSWORD;
  const from = env.SMTP_FROM?.trim();
  if (!host || /[\s\r\n]/.test(host) || !Number.isInteger(port) ||
      port < 1 || port > 65535 || !user || !password || !from || !EMAIL.test(from)) {
    throw new Error('SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD and SMTP_FROM are required');
  }
  return { host, port, user, password, from };
}

type Reply = { code: number; lines: string[] };

/** Implicit TLS SMTP (normally port 465). Never sends credentials on a clear socket. */
export class SmtpEmailTransport implements EmailTransport {
  constructor(private readonly config: SmtpConfig) {}

  async send(message: EmailMessage): Promise<void> {
    if (!EMAIL.test(message.to)) throw new Error('Recipient email address is invalid');
    const socket = tls.connect({
      host: this.config.host,
      port: this.config.port,
      servername: this.config.host,
      rejectUnauthorized: true,
    });
    socket.setTimeout(30_000, () => socket.destroy(new Error('SMTP timeout')));
    let buffer = '';
    let lines: string[] = [];
    const replies: Reply[] = [];
    let waiter: { resolve: (reply: Reply) => void; reject: (error: Error) => void } | null = null;
    let disconnected: Error | null = null;
    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      while (buffer.includes('\n')) {
        const boundary = buffer.indexOf('\n');
        const line = buffer.slice(0, boundary).replace(/\r$/, '');
        buffer = buffer.slice(boundary + 1);
        if (!/^\d{3}[ -]/.test(line)) continue;
        lines.push(line);
        if (line[3] !== ' ') continue;
        const reply = { code: Number(line.slice(0, 3)), lines };
        lines = [];
        if (waiter) {
          const current = waiter;
          waiter = null;
          current.resolve(reply);
        } else {
          replies.push(reply);
        }
      }
    });
    const disconnect = (error: Error) => {
      disconnected = error;
      if (waiter) {
        const current = waiter;
        waiter = null;
        current.reject(error);
      }
    };
    socket.on('error', disconnect);
    socket.on('close', () => disconnect(new Error('SMTP connection closed')));
    const read = (): Promise<Reply> => {
      const queued = replies.shift();
      if (queued) return Promise.resolve(queued);
      if (disconnected) return Promise.reject(disconnected);
      return new Promise((resolve, reject) => { waiter = { resolve, reject }; });
    };
    const expect = async (allowed: number[]): Promise<Reply> => {
      const reply = await read();
      if (!allowed.includes(reply.code)) {
        throw new Error(`SMTP rejected command with code ${reply.code}`);
      }
      return reply;
    };
    const command = async (line: string, allowed: number[]): Promise<Reply> => {
      socket.write(`${line}\r\n`);
      return expect(allowed);
    };
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('secureConnect', resolve);
        socket.once('error', reject);
      });
      await expect([220]);
      const greeting = await command('EHLO swrtracker.local', [250]);
      if (!greeting.lines.some(line => /AUTH(?:\s|=).*PLAIN/i.test(line))) {
        throw new Error('SMTP server does not offer AUTH PLAIN');
      }
      await command(`AUTH PLAIN ${Buffer.from(`\0${this.config.user}\0${this.config.password}`).toString('base64')}`, [235]);
      await command(`MAIL FROM:<${this.config.from}>`, [250]);
      await command(`RCPT TO:<${message.to}>`, [250, 251]);
      await command('DATA', [354]);
      const subject = message.subject.replace(/[\r\n]/g, ' ');
      const body = message.text.replace(/\r\n?/g, '\n').split('\n')
        .map(line => line.startsWith('.') ? `.${line}` : line).join('\r\n');
      const id = `${message.deliveryId}@swrtracker.local`;
      socket.write(
        `From: <${this.config.from}>\r\nTo: <${message.to}>\r\n` +
        `Subject: ${subject}\r\nDate: ${new Date().toUTCString()}\r\n` +
        `Message-ID: <${id}>\r\nMIME-Version: 1.0\r\n` +
        `Content-Type: text/plain; charset=utf-8\r\n\r\n${body}\r\n.\r\n`,
      );
      await expect([250]);
      await command('QUIT', [221]);
    } finally {
      socket.end();
    }
  }
}
