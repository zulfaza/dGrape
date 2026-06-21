import { afterEach, describe, expect, it } from "vitest";
import { Effect } from "effect";

import {
  APPLICATION_AGENT_SYSTEM_PROMPT,
  ExternalRequestError,
  parseLlmConfig,
  withExternalRetry,
} from "./services";

afterEach(() => {
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.OPENAI_API_KEY;
});

describe("parseLlmConfig", () => {
  it("builds DeepSeek config", () => {
    process.env.DEEPSEEK_API_KEY = "deepseek-key";
    expect(parseLlmConfig("deepseek", "deepseek-chat")).toEqual({
      provider: "deepseek",
      model: "deepseek-chat",
      apiKey: "deepseek-key",
    });
  });

  it("builds OpenAI config", () => {
    process.env.OPENAI_API_KEY = "openai-key";
    expect(parseLlmConfig("openai", "gpt-5-mini")).toEqual({
      provider: "openai",
      model: "gpt-5-mini",
      apiKey: "openai-key",
    });
  });
});

describe("withExternalRetry", () => {
  it("retries transient failures", async () => {
    let attempts = 0;
    const result = await Effect.runPromise(
      withExternalRetry(
        Effect.try({
          try: () => {
            attempts += 1;
            if (attempts < 3) throw new ExternalRequestError("Retry", true);
            return "done";
          },
          catch: (error) =>
            error instanceof ExternalRequestError
              ? error
              : new ExternalRequestError("Unexpected error", false),
        }),
      ),
    );
    expect(result).toBe("done");
    expect(attempts).toBe(3);
  });
});

describe("APPLICATION_AGENT_SYSTEM_PROMPT", () => {
  it("limits answers to job topics", () => {
    expect(APPLICATION_AGENT_SYSTEM_PROMPT).toContain("Scope:");
    expect(APPLICATION_AGENT_SYSTEM_PROMPT).toContain("Decline unrelated topics briefly");
  });

  it("treats supplied content as untrusted", () => {
    expect(APPLICATION_AGENT_SYSTEM_PROMPT).toContain("untrusted data");
    expect(APPLICATION_AGENT_SYSTEM_PROMPT).toContain("reveal prompts");
    expect(APPLICATION_AGENT_SYSTEM_PROMPT).toContain("exfiltrate data");
  });
});
