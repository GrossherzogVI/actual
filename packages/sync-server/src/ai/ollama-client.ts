import { config } from '../load-config.js';

export type OllamaGenerateOptions = {
  model?: string;
  temperature?: number;
  format?: 'json';
  images?: string[]; // base64 encoded images for vision models
};

export function isOllamaEnabled(): boolean {
  return config.get('ollama.enabled') === true;
}

export function getOllamaConfig() {
  return {
    url: config.get('ollama.url') as string,
    model: config.get('ollama.model') as string,
    enabled: config.get('ollama.enabled') as boolean,
  };
}

export async function ollamaGenerate(
  prompt: string,
  options: OllamaGenerateOptions = {},
): Promise<string> {
  const cfg = getOllamaConfig();
  if (!cfg.enabled) {
    throw new Error('Ollama AI features are not enabled');
  }

  const model = options.model || cfg.model;
  const url = `${cfg.url}/api/generate`;

  const body: Record<string, unknown> = {
    model,
    prompt,
    stream: false,
  };

  if (options.temperature !== undefined) {
    body.options = { temperature: options.temperature };
  }
  if (options.format) {
    body.format = options.format;
  }
  if (options.images?.length) {
    body.images = options.images;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => 'unknown error');
    throw new Error(`Ollama request failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as { response: string };
  return data.response;
}

export async function ollamaChat(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options: OllamaGenerateOptions = {},
): Promise<string> {
  const cfg = getOllamaConfig();
  if (!cfg.enabled) {
    throw new Error('Ollama AI features are not enabled');
  }

  const model = options.model || cfg.model;
  const url = `${cfg.url}/api/chat`;

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: false,
  };

  if (options.temperature !== undefined) {
    body.options = { temperature: options.temperature };
  }
  if (options.format) {
    body.format = options.format;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => 'unknown error');
    throw new Error(`Ollama chat request failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as {
    message: { content: string };
  };
  return data.message.content;
}
