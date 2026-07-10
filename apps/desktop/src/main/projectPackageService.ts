import {
  GamePulseProjectPackageCodec,
  type LocalStore,
  type ProjectMergeResult,
  type ProjectPackageCodec
} from "@gamepulse/shared";

export class ProjectPackageService {
  constructor(
    private readonly store: LocalStore,
    private readonly codec: ProjectPackageCodec = new GamePulseProjectPackageCodec()
  ) {}

  async exportProject(projectId: string): Promise<Uint8Array> {
    return this.codec.encode(await this.store.exportProject(projectId));
  }

  async importProject(bytes: Uint8Array): Promise<ProjectMergeResult> {
    return this.store.importProject(await this.codec.decode(bytes));
  }

  async importProjectStream(chunks: AsyncIterable<Uint8Array>): Promise<ProjectMergeResult> {
    const snapshot = this.codec.decodeStream
      ? await this.codec.decodeStream(chunks)
      : await this.codec.decode(await collectBytes(chunks));
    return this.store.importProject(snapshot);
  }
}

async function collectBytes(chunks: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const collected: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of chunks) {
    collected.push(chunk);
    length += chunk.byteLength;
  }

  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of collected) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
