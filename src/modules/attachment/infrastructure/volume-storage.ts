import { randomUUID } from 'node:crypto';
import { readdir, mkdir, open, readFile, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { InternalError, NotFoundError, ValidationError } from '@/shared/errors';
import type { UUID } from '@/shared/types';
import type { IAttachmentStorage, StoredObject } from '../application/ports';

const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const KEY_PATTERN = new RegExp(`^${UUID_PATTERN}/${UUID_PATTERN}/${UUID_PATTERN}$`, 'u');
const ID_PATTERN = new RegExp(`^${UUID_PATTERN}$`, 'u');

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error &&
    error.code === 'ENOENT';
}

export class VolumeAttachmentStorage implements IAttachmentStorage {
  readonly root: string;

  constructor(root = process.env.ATTACHMENT_STORAGE_ROOT) {
    if (!root || !path.isAbsolute(root)) {
      throw new Error('ATTACHMENT_STORAGE_ROOT must be an absolute Railway volume path');
    }
    this.root = path.resolve(root);
  }

  createStorageKey(tenantId: UUID, ticketId: UUID): string {
    if (!ID_PATTERN.test(tenantId) || !ID_PATTERN.test(ticketId)) {
      throw new ValidationError('Invalid attachment tenant or ticket ID');
    }
    return `${tenantId}/${ticketId}/${randomUUID()}`;
  }

  private filePath(storageKey: string): string {
    if (!KEY_PATTERN.test(storageKey)) throw new ValidationError('Invalid attachment storage key');
    const target = path.resolve(this.root, ...storageKey.split('/'));
    const relative = path.relative(this.root, target);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)) {
      throw new ValidationError('Attachment storage key escapes its volume');
    }
    return target;
  }

  async write(storageKey: string, body: ReadableStream<Uint8Array>,
    maxBytes: number): Promise<number> {
    const target = this.filePath(storageKey);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    const file = await open(target, 'wx', 0o600);
    const reader = body.getReader();
    let total = 0;
    let failed = false;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) throw new ValidationError('Attachment exceeds 20 MiB');
        let offset = 0;
        while (offset < value.byteLength) {
          const { bytesWritten } = await file.write(value, offset, value.byteLength - offset);
          if (bytesWritten < 1) throw new Error('Attachment storage write made no progress');
          offset += bytesWritten;
        }
      }
      if (total < 1) throw new ValidationError('Attachment is empty');
    } catch (error) {
      failed = true;
      await reader.cancel();
      throw error;
    } finally {
      reader.releaseLock();
      await file.close();
      if (failed) await this.remove(storageKey);
    }
    return total;
  }

  async read(storageKey: string): Promise<Uint8Array> {
    const target = this.filePath(storageKey);
    try {
      const info = await stat(target);
      if (info.size > 20 * 1024 * 1024) {
        throw new InternalError('Attachment file exceeds the allowed size');
      }
      return await readFile(target);
    } catch (error) {
      if (isMissing(error)) throw new NotFoundError('Attachment bytes not found');
      throw error;
    }
  }

  async remove(storageKey: string): Promise<void> {
    try {
      await unlink(this.filePath(storageKey));
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }

  async *listTenantObjects(tenantId: UUID): AsyncIterable<StoredObject> {
    if (!ID_PATTERN.test(tenantId)) throw new ValidationError('Invalid tenant ID');
    const tenantDir = path.join(this.root, tenantId);
    let ticketDirs;
    try {
      ticketDirs = await readdir(tenantDir, { withFileTypes: true });
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
    for (const ticketDir of ticketDirs) {
      if (!ticketDir.isDirectory() || !ID_PATTERN.test(ticketDir.name)) continue;
      const directory = path.join(tenantDir, ticketDir.name);
      let files;
      try {
        files = await readdir(directory, { withFileTypes: true });
      } catch (error) {
        if (isMissing(error)) continue;
        throw error;
      }
      for (const file of files) {
        if (!file.isFile() || !ID_PATTERN.test(file.name)) continue;
        const key = `${tenantId}/${ticketDir.name}/${file.name}`;
        try {
          const info = await stat(this.filePath(key));
          yield { storageKey: key, modifiedAt: info.mtime };
        } catch (error) {
          if (!isMissing(error)) throw error;
        }
      }
    }
  }
}
