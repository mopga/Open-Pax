/**
 * Open-Pax — LLM Provider (MiniMax)
 * ================================
 */

import 'dotenv/config';
import https from 'https';
import { hash } from './utils/hash';

export interface LLMResponse {
  content: string;
  tokensUsed?: number;
}

interface CacheEntry {
  response: LLMResponse;
  timestamp: number;
}

export class MiniMaxProvider {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private cache: Map<string, CacheEntry>;
  private cacheTTL: number;
  private cacheHits: number;
  private cacheMisses: number;

  constructor() {
    this.apiKey = process.env.MINIMAX_API_KEY || '';
    this.baseUrl = process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1';
    this.model = process.env.LLM_MODEL || 'MiniMax-M2.5';
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  /**
   * Build a cache key from generate() inputs
   */
  private buildCacheKey(system: string, user: string, options: { temperature?: number; maxTokens?: number }): string {
    const data = JSON.stringify({ system, user, options });
    return hash(data);
  }

  /**
   * Clear the response cache (e.g., when world prompt changes)
   */
  clearCache(): void {
    this.cache.clear();
    console.log('[LLM Cache] Cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hits: number; misses: number; hitRate: string } {
    const total = this.cacheHits + this.cacheMisses;
    return {
      size: this.cache.size,
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: total > 0 ? `${((this.cacheHits / total) * 100).toFixed(1)}%` : '0%',
    };
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

    // Check cache first
    const cacheKey = this.buildCacheKey(system, user, options);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      this.cacheHits++;
      console.log('[LLM Cache] HIT:', cacheKey.substring(0, 50));
      return cached.response;
    }
    this.cacheMisses++;
    console.log('[LLM Cache] MISS:', cacheKey.substring(0, 50));

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

      const response: LLMResponse = {
        content: data.choices?.[0]?.message?.content || '',
        tokensUsed: data.usage?.total_tokens,
      };

      // Store in cache
      this.cache.set(cacheKey, { response, timestamp: Date.now() });

      return response;
    } catch (error) {
      console.error('LLM request failed:', error);
      return { content: '[Request failed]' };
    }
  }
}

// Singleton instance
export const llmProvider = new MiniMaxProvider();
