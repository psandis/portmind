/**
 * Provider abstraction for AI `explain`. Each provider takes the already
 * allowlisted+sanitized payload (see allowlist.ts) and returns a plain-
 * English explanation string.
 *
 * `fetchImpl` is injectable so tests can verify the exact request shape
 * (URL, headers, body) without making a real network call - there is no
 * API key available in this environment to test a live call end to end,
 * so correctness here rests on matching each provider's documented API
 * shape exactly, not on having actually exercised it against the real
 * service.
 */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface AiProvider {
  explain(payload: Record<string, unknown>, apiKey: string, model: string): Promise<string>;
}

export class AiProviderError extends Error {}

function buildPrompt(payload: Record<string, unknown>): string {
  return [
    "You are helping a developer understand what is running on a network port on their machine.",
    "Given this data about a listening port, explain in 2-3 plain-English sentences what this process/service most likely is and why it might be running:",
    JSON.stringify(payload, null, 2),
  ].join("\n\n");
}

export function createAnthropicProvider(fetchImpl: FetchLike = fetch): AiProvider {
  return {
    async explain(payload, apiKey, model) {
      const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 300,
          messages: [{ role: "user", content: buildPrompt(payload) }],
        }),
      });

      if (!res.ok) {
        throw new AiProviderError(`Anthropic API error: ${res.status} ${await safeText(res)}`);
      }

      const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      const text = data.content?.find((block) => block.type === "text")?.text;
      if (!text) throw new AiProviderError("Anthropic API returned no text content");
      return text.trim();
    },
  };
}

export function createOpenAiProvider(fetchImpl: FetchLike = fetch): AiProvider {
  return {
    async explain(payload, apiKey, model) {
      const res = await fetchImpl("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: buildPrompt(payload) }],
        }),
      });

      if (!res.ok) {
        throw new AiProviderError(`OpenAI API error: ${res.status} ${await safeText(res)}`);
      }

      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new AiProviderError("OpenAI API returned no message content");
      return text.trim();
    },
  };
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
