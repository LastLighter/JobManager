import { appendFileSync, existsSync, mkdirSync } from "fs";
import { appendFile } from "fs/promises";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const COMPLETED_TASKS_FILE = path.join(DATA_DIR, "completed_tasks.log");
const DEFAULT_FLUSH_THRESHOLD = 10_000;

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function sanitizeValue(value: string): string {
  if (!value) {
    return "";
  }
  return value.replace(/[\r\n]+/g, " ").trim();
}

class CompletedTaskArchive {
  private buffer: string[] = [];
  private flushPromise: Promise<void> | null = null;
  private flushScheduled = false;
  private readonly flushThreshold: number;

  constructor(flushThreshold = DEFAULT_FLUSH_THRESHOLD) {
    this.flushThreshold = Math.max(1, Math.floor(flushThreshold));
    this.installExitHooks();
  }

  record(taskPath: string, itemCount: number) {
    if (typeof taskPath !== "string" || taskPath.trim() === "") {
      return;
    }

    const normalizedPath = sanitizeValue(taskPath);
    const normalizedCount =
      typeof itemCount === "number" && Number.isFinite(itemCount) && itemCount >= 0
        ? Math.floor(itemCount)
        : 0;

    const line = JSON.stringify([normalizedPath, normalizedCount]);
    this.buffer.push(line);

    if (this.buffer.length >= this.flushThreshold) {
      this.scheduleFlush();
    }
  }

  async flush(): Promise<void> {
    if (this.flushPromise) {
      return this.flushPromise;
    }
    if (this.buffer.length === 0) {
      return;
    }

    const payload = this.drainBuffer();
    if (!payload) {
      return;
    }

    ensureDataDir();
    this.flushPromise = appendFile(COMPLETED_TASKS_FILE, payload, { encoding: "utf-8", flag: "a" });

    try {
      await this.flushPromise;
    } catch (error) {
      console.error("[已完成任务归档] 异步写入失败", error);
      this.restoreBuffer(payload);
    } finally {
      this.flushPromise = null;
    }
  }

  flushSync(): void {
    if (this.flushPromise) {
      // Best effort: wait for the pending promise to settle.
      this.flushPromise
        .catch((error) => {
          console.error("[已完成任务归档] 异步写入失败", error);
        })
        .finally(() => {
          this.flushPromise = null;
        });
    }

    if (this.buffer.length === 0) {
      return;
    }

    const payload = this.drainBuffer();
    if (!payload) {
      return;
    }

    try {
      ensureDataDir();
      appendFileSync(COMPLETED_TASKS_FILE, payload, { encoding: "utf-8", flag: "a" });
    } catch (error) {
      console.error("[已完成任务归档] 同步写入失败", error);
      this.restoreBuffer(payload);
    }
  }

  private scheduleFlush() {
    if (this.flushScheduled) {
      return;
    }
    this.flushScheduled = true;
    setImmediate(() => {
      this.flushScheduled = false;
      void this.flush();
    });
  }

  private drainBuffer(): string | null {
    if (this.buffer.length === 0) {
      return null;
    }
    const lines = this.buffer.splice(0, this.buffer.length);
    return `${lines.join("\n")}\n`;
  }

  private restoreBuffer(payload: string) {
    if (!payload) {
      return;
    }
    const lines = payload.split("\n").filter((line) => line.trim() !== "");
    if (lines.length > 0) {
      this.buffer = [...lines, ...this.buffer];
    }
  }

  private installExitHooks() {
    if (typeof process === "undefined" || !process.on) {
      return;
    }

    const handleExit = () => {
      try {
        this.flushSync();
      } catch (error) {
        console.error("[已完成任务归档] 退出前写入失败", error);
      }
    };

    process.on("beforeExit", () => {
      void this.flush();
    });
    process.on("exit", handleExit);
    process.on("SIGINT", () => {
      handleExit();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      handleExit();
      process.exit(0);
    });
  }
}

export const completedTaskArchive = new CompletedTaskArchive();

