/**
 * Open-Pax — LLM Provider (MiniMax)
 * ================================
 */

import 'dotenv/config';
import https from 'https';

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

  /**
   * Make HTTPS request using Node.js native https module
   * This properly handles UTF-8 encoding for Cyrillic text
   */
  private async httpsRequest(path: string, data: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Parse baseUrl to get hostname
      const url = new URL(this.baseUrl);
      const options = {
        hostname: url.hostname,
        path: path,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': Buffer.byteLength(data),
        },
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve(body));
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
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
      const payload = {
        model: this.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 4096,
      };

      const body = JSON.stringify(payload);
      console.log('[LLM] Request body:', body.substring(0, 200));

      const responseText = await this.httpsRequest('/v1/text/chatcompletion_v2', body);
      console.log('[LLM] Response:', responseText.substring(0, 500));

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        console.error('[LLM] JSON parse error:', e);
        return { content: '[Invalid JSON response]' };
      }

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

// Singleton instance
export const llmProvider = new MiniMaxProvider();
