import { describe, it, expect } from "vitest";
import { logger } from "./logger.ts";

describe("logger", () => {
  it("exports a pino logger instance", () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });

  it("has a default log level", () => {
    expect(logger.level).toBeDefined();
  });
});
