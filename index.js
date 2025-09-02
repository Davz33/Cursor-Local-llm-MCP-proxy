#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fetch from 'node-fetch';

class LocalLLMProxyServer {
  constructor() {
    this.server = new Server(
      {
        name: 'local-llm-proxy',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.localLLMUrl = 'http://127.0.0.1:1234';
    this.fallbackModels = [
      'gpt-4',
      'gpt-3.5-turbo',
      'claude-3-sonnet',
    ];

    // Configuration for LLM-based validation
    this.validationConfig = {
      enabled: process.env.LLM_VALIDATION_ENABLED === 'true',
      useLocalValidator: process.env.USE_LOCAL_VALIDATOR === 'true',
      maxRetries: parseInt(process.env.MAX_REFINEMENT_RETRIES) || 2,
    };

    this.setupHandlers();
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'generate_text',
            description: 'Generate text using local LLM with fallback to other models',
            inputSchema: {
              type: 'object',
              properties: {
                prompt: {
                  type: 'string',
                  description: 'The text prompt to generate from',
                },
                max_tokens: {
                  type: 'number',
                  description: 'Maximum number of tokens to generate',
                  default: 1000,
                },
                temperature: {
                  type: 'number',
                  description: 'Temperature for generation',
                  default: 0.7,
                },
                use_local_first: {
                  type: 'boolean',
                  description: 'Whether to try local LLM first',
                  default: true,
                },
              },
              required: ['prompt'],
            },
          },
          {
            name: 'chat_completion',
            description: 'Chat completion using local LLM with fallback',
            inputSchema: {
              type: 'object',
              properties: {
                messages: {
                  type: 'array',
                  description: 'Array of chat messages',
                  items: {
                    type: 'object',
                    properties: {
                      role: { type: 'string', enum: ['system', 'user', 'assistant'] },
                      content: { type: 'string' },
                    },
                    required: ['role', 'content'],
                  },
                },
                max_tokens: {
                  type: 'number',
                  description: 'Maximum number of tokens to generate',
                  default: 1000,
                },
                temperature: {
                  type: 'number',
                  description: 'Temperature for generation',
                  default: 0.7,
                },
              },
              required: ['messages'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'generate_text':
            return await this.handleTextGeneration(args);
          case 'chat_completion':
            return await this.handleChatCompletion(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async handleTextGeneration(args) {
    const { prompt, max_tokens = 1000, temperature = 0.7, use_local_first = true } = args;

    if (use_local_first) {
      try {
        // Try local LLM first
        const localResponse = await this.callLocalLLM({
          model: 'local',
          prompt,
          max_tokens,
          temperature,
        });

        // Validate the response
        const isValid = await this.validateResponse(localResponse, prompt);
        
        if (isValid) {
          return {
            content: [
              {
                type: 'text',
                text: localResponse,
              },
            ],
            metadata: {
              model_used: 'local',
              fallback_used: false,
            },
          };
        }
      } catch (error) {
        console.log('Local LLM failed, trying fallback:', error.message);
      }
    }

    // Fallback to other models
    return await this.tryFallbackModels({
      prompt,
      max_tokens,
      temperature,
    });
  }

  async handleChatCompletion(args) {
    const { messages, max_tokens = 1000, temperature = 0.7 } = args;

    try {
      // Try local LLM first
      const localResponse = await this.callLocalLLMChat({
        model: 'local',
        messages,
        max_tokens,
        temperature,
      });

      // Validate the response
      const isValid = await this.validateResponse(localResponse, messages[messages.length - 1]?.content || '');
      
      if (isValid) {
        return {
          content: [
            {
              type: 'text',
              text: localResponse,
            },
          ],
          metadata: {
            model_used: 'local',
            fallback_used: false,
          },
        };
      }
    } catch (error) {
      console.log('Local LLM failed, trying fallback:', error.message);
    }

    // Fallback to other models
    return await this.tryFallbackChatModels({
      messages,
      max_tokens,
      temperature,
    });
  }

  async callLocalLLM(params) {
    const response = await fetch(`${this.localLLMUrl}/v1/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'local',
        prompt: params.prompt,
        max_tokens: params.max_tokens,
        temperature: params.temperature,
      }),
    });

    if (!response.ok) {
      throw new Error(`Local LLM request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0]?.text || '';
  }

  async callLocalLLMChat(params) {
    const response = await fetch(`${this.localLLMUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'local',
        messages: params.messages,
        max_tokens: params.max_tokens,
        temperature: params.temperature,
      }),
    });

    if (!response.ok) {
      throw new Error(`Local LLM chat request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  }

  async validateResponse(response, originalPrompt) {
    // Basic validation first
    if (!response || response.trim().length === 0) {
      return { valid: false, reason: 'empty_response' };
    }

    // Check if response is too short (less than 10 characters)
    if (response.trim().length < 10) {
      return { valid: false, reason: 'too_short' };
    }

    // Check if response contains error indicators
    const errorIndicators = ['error', 'failed', 'unable to', 'cannot', 'sorry, i cannot'];
    const lowerResponse = response.toLowerCase();
    if (errorIndicators.some(indicator => lowerResponse.includes(indicator))) {
      return { valid: false, reason: 'error_indicators' };
    }

    // If LLM validation is enabled, use it for more sophisticated validation
    if (this.validationConfig.enabled) {
      return await this.validateWithLLM(response, originalPrompt);
    }

    return { valid: true, reason: 'basic_validation_passed' };
  }

  async validateWithLLM(response, originalPrompt) {
    try {
      const validationPrompt = `You are a quality assessor for AI responses. Please evaluate the following response to determine if it adequately addresses the user's prompt.

USER PROMPT: "${originalPrompt}"

AI RESPONSE: "${response}"

Please assess the response on these criteria:
1. Relevance: Does the response directly address the user's question/prompt?
2. Completeness: Is the response complete and informative?
3. Accuracy: Does the response appear factually correct?
4. Clarity: Is the response clear and well-structured?
5. Helpfulness: Would this response be helpful to the user?

Respond with ONLY a JSON object in this exact format:
{
  "valid": true/false,
  "confidence": 0.0-1.0,
  "reason": "brief explanation",
  "suggestions": ["suggestion1", "suggestion2"] (only if valid: false)
}`;

      // Use local LLM for validation
      const validationResponse = await fetch(`${this.localLLMUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'local',
          messages: [
            { role: 'system', content: 'You are a helpful assistant that evaluates AI responses for quality and relevance. Always respond with valid JSON.' },
            { role: 'user', content: validationPrompt }
          ],
          max_tokens: 300,
          temperature: 0.1,
        }),
      });

      if (!validationResponse.ok) {
        console.log('Local LLM validation failed, falling back to basic validation');
        return { valid: true, reason: 'local_llm_validation_failed_fallback' };
      }

      const validationData = await validationResponse.json();
      const validationText = validationData.choices[0]?.message?.content || '';

      try {
        const validation = JSON.parse(validationText);
        return {
          valid: validation.valid,
          reason: validation.reason,
          confidence: validation.confidence || 0.5,
          suggestions: validation.suggestions || [],
        };
      } catch (parseError) {
        console.log('Failed to parse local LLM validation response, using fallback');
        return { valid: true, reason: 'local_llm_validation_parse_error' };
      }

    } catch (error) {
      console.log('Local LLM validation error:', error.message);
      return { valid: true, reason: 'local_llm_validation_error_fallback' };
    }
  }

  async refineResponse(originalResponse, originalPrompt, validation) {
    if (!this.validationConfig.enabled || !validation.suggestions || validation.suggestions.length === 0) {
      return null;
    }

    try {
      const refinementPrompt = `The following response was generated but needs improvement based on the validation feedback.

ORIGINAL PROMPT: "${originalPrompt}"

ORIGINAL RESPONSE: "${originalResponse}"

VALIDATION FEEDBACK: ${validation.reason}
SUGGESTIONS: ${validation.suggestions.join(', ')}

Please provide an improved version of the response that addresses the validation feedback while maintaining the core information. Make the response more relevant, complete, accurate, clear, and helpful.

IMPROVED RESPONSE:`;

      const refinedResponse = await fetch(`${this.localLLMUrl}/v1/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'local',
          prompt: refinementPrompt,
          max_tokens: 500,
          temperature: 0.3,
        }),
      });

      if (!refinedResponse.ok) {
        console.log('Response refinement failed');
        return null;
      }

      const data = await refinedResponse.json();
      const refined = data.choices[0]?.text || '';

      // Validate the refined response
      const refinedValidation = await this.validateResponse(refined, originalPrompt);
      
      if (refinedValidation.valid) {
        console.log('Response successfully refined');
        return refined;
      } else {
        console.log('Refined response still not valid, trying fallback');
        return null;
      }

    } catch (error) {
      console.log('Error during response refinement:', error.message);
      return null;
    }
  }

  async tryFallbackModels(params) {
    // This is a placeholder - in a real implementation, you would
    // integrate with other LLM providers (OpenAI, Anthropic, etc.)
    
    return {
      content: [
        {
          type: 'text',
          text: `Fallback response for: ${params.prompt}\n\n[This would be replaced with actual fallback LLM integration]`,
        },
      ],
      metadata: {
        model_used: 'fallback',
        fallback_used: true,
      },
    };
  }

  async tryFallbackChatModels(params) {
    // This is a placeholder - in a real implementation, you would
    // integrate with other LLM providers
    
    return {
      content: [
        {
          type: 'text',
          text: `Fallback chat response for: ${params.messages[params.messages.length - 1]?.content}\n\n[This would be replaced with actual fallback LLM integration]`,
        },
      ],
      metadata: {
        model_used: 'fallback',
        fallback_used: true,
      },
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Local LLM Proxy MCP server running on stdio');
  }
}

const server = new LocalLLMProxyServer();
server.run().catch(console.error);

// Export for testing
export { LocalLLMProxyServer };

