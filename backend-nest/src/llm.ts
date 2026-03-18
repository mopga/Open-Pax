/**
 * Open-Pax — LLM Provider (MiniMax)
 * ================================
 */

import 'dotenv/config';

// @ts-ignore - node-fetch v3
import fetch from 'node-fetch';

export interface LLMResponse {
  content: string;
  tokensUsed?: number;
}

export class MiniMaxProvider {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.MINIMAX_API_KEY || '';
    this.baseUrl = process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1';
    this.model = process.env.LLM_MODEL || 'MiniMax-M2.5';
  }

  async generate(
    system: string,
    user: string,
    options: { temperature?: number; maxTokens?: number } = {}
  ): Promise<LLMResponse> {
    if (!this.apiKey) {
      return { content: '[LLM not configured - set MINIMAX_API_KEY]' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/text/chatcompletion_v2`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 4096,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('MiniMax API error:', error);
        return { content: `[API Error: ${response.status}]` };
      }

      const data = await response.json() as any;
      return {
        content: data.choices?.[0]?.message?.content || '',
        tokensUsed: data.usage?.total_tokens,
      };
    } catch (error) {
      console.error('LLM request failed:', error);
      return { content: '[Request failed]' };
    }
  }
}
