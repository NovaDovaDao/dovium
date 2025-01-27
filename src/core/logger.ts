import { Logger } from "jsr:@deno-library/logger";

export class DoviumLogger {
  private logger = new Logger();

  constructor(private readonly name?: string) {
    this.init();
  }

  async init() {
    await this.logger.initFileLogger("../../logs", { rotate: true });
  }

  log(...args: unknown[]) {
    this.logger.log(this.name, ...args);
  }

  warn(...args: unknown[]) {
    this.logger.warn(this.name, ...args);
  }

  verbose(...args: unknown[]) {
    this.logger.info(this.name, ...args);
  }

  error(...args: unknown[]) {
    this.logger.error(this.name, ...args);
  }
}
