import { describe, expect, it, vi } from "vitest";
import { createAnthropicProvider, createOpenAiProvider, AiProviderError } from "../src/ai/provider.js";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("createAnthropicProvider", () => {
  it("sends the documented Anthropic Messages API request shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ content: [{ type: "text", text: "This is postgres, a database." }] }),
    );
    const provider = createAnthropicProvider(fetchMock);

    const result = await provider.explain({ port: 5432 }, "test-key", "claude-sonnet-4-6");

    expect(result).toBe("This is postgres, a database.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("test-key");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("claude-sonnet-4-6");
    expect(body.messages[0].role).toBe("user");
    expect(body.messages[0].content).toContain('"port": 5432');
  });

  it("throws AiProviderError on a non-ok response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "bad key" }, false, 401));
    const provider = createAnthropicProvider(fetchMock);
    await expect(provider.explain({}, "bad-key", "claude-sonnet-4-6")).rejects.toThrow(AiProviderError);
  });

  it("throws AiProviderError when the response has no text content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ content: [] }));
    const provider = createAnthropicProvider(fetchMock);
    await expect(provider.explain({}, "key", "model")).rejects.toThrow(AiProviderError);
  });
});

describe("createOpenAiProvider", () => {
  it("sends the documented OpenAI Chat Completions request shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "This is mysql." } }] }),
    );
    const provider = createOpenAiProvider(fetchMock);

    const result = await provider.explain({ port: 3306 }, "test-key", "gpt-4o");

    expect(result).toBe("This is mysql.");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer test-key");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("gpt-4o");
  });

  it("throws AiProviderError on a non-ok response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 500));
    const provider = createOpenAiProvider(fetchMock);
    await expect(provider.explain({}, "key", "gpt-4o")).rejects.toThrow(AiProviderError);
  });
});
