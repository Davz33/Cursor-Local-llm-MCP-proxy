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

  processContext(context) {
    if (!context) return '';

    let contextText = '';
    
    // Process past chats
    if (context.past_chats && context.past_chats.length > 0) {
      contextText += '\n\n## Previous Chat Context:\n';
      context.past_chats.slice(-5).forEach((chat, index) => {
        contextText += `${chat.role}: ${chat.content}\n`;
      });
    }

    // Process file contents
    if (context.files && context.files.length > 0) {
      contextText += '\n\n## Relevant Files:\n';
      context.files.forEach((file, index) => {
        contextText += `\n### File: ${file.path}\n`;
        contextText += `${file.content}\n`;
      });
    }

    // Process memory entries
    if (context.memory && context.memory.length > 0) {
      contextText += '\n\n## Relevant Memory:\n';
      context.memory.forEach((memory, index) => {
        contextText += `- ${memory}\n`;
      });
    }

    // Process Context7 documentation
    if (context.context7_docs && context.context7_docs.length > 0) {
      contextText += '\n\n## Documentation Context:\n';
      context.context7_docs.forEach((doc, index) => {
        contextText += `${doc}\n`;
      });
    }

    // Process custom context
    if (context.custom_context) {
      contextText += '\n\n## Additional Context:\n';
      contextText += `${context.custom_context}\n`;
    }

    return contextText;
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
                context: {
                  type: 'object',
                  description: 'Context information to enhance the response',
                  properties: {
                    past_chats: {
                      type: 'array',
                      description: 'Previous chat messages for context',
                      items: {
                        type: 'object',
                        properties: {
                          role: { type: 'string' },
                          content: { type: 'string' }
                        }
                      }
                    },
                    files: {
                      type: 'array',
                      description: 'Relevant file contents',
                      items: {
                        type: 'object',
                        properties: {
                          path: { type: 'string' },
                          content: { type: 'string' }
                        }
                      }
                    },
                    memory: {
                      type: 'array',
                      description: 'Relevant memory entries',
                      items: { type: 'string' }
                    },
                    context7_docs: {
                      type: 'array',
                      description: 'Context7 documentation snippets',
                      items: { type: 'string' }
                    },
                    custom_context: {
                      type: 'string',
                      description: 'Any additional context information'
                    }
                  }
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
                context: {
                  type: 'object',
                  description: 'Context information to enhance the response',
                  properties: {
                    past_chats: {
                      type: 'array',
                      description: 'Previous chat messages for context',
                      items: {
                        type: 'object',
                        properties: {
                          role: { type: 'string' },
                          content: { type: 'string' }
                        }
                      }
                    },
                    files: {
                      type: 'array',
                      description: 'Relevant file contents',
                      items: {
                        type: 'object',
                        properties: {
                          path: { type: 'string' },
                          content: { type: 'string' }
                        }
                      }
                    },
                    memory: {
                      type: 'array',
                      description: 'Relevant memory entries',
                      items: { type: 'string' }
                    },
                    context7_docs: {
                      type: 'array',
                      description: 'Context7 documentation snippets',
                      items: { type: 'string' }
                    },
                    custom_context: {
                      type: 'string',
                      description: 'Any additional context information'
                    }
                  }
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
    const { prompt, context, max_tokens = 1000, temperature = 0.7, use_local_first = true } = args;

    if (use_local_first) {
      try {
        // Process context and enhance prompt
        const contextText = this.processContext(context);
        const enhancedPrompt = contextText ? `${prompt}\n\n${contextText}` : prompt;

        // Try local LLM first
        const localResponse = await this.callLocalLLM({
          model: 'local',
          prompt: enhancedPrompt,
          max_tokens,
          temperature,
        });

        // Validate the response
        const validation = await this.validateResponse(localResponse, prompt);
        
        if (validation.valid) {
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
              validation: validation,
            },
          };
        }

        // Try to refine the response using validation suggestions
        const refinedResponse = await this.refineResponse(localResponse, prompt, validation, context);
        if (refinedResponse) {
          return {
            content: [
              {
                type: 'text',
                text: refinedResponse,
              },
            ],
            metadata: {
              model_used: 'local_refined',
              fallback_used: false,
              validation: validation,
              refined: true,
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
    const { messages, context, max_tokens = 1000, temperature = 0.7 } = args;

    try {
      // Process context and enhance messages
      const contextText = this.processContext(context);
      let enhancedMessages = [...messages];
      
      if (contextText) {
        // Add context as a system message or append to the last user message
        const lastMessage = enhancedMessages[enhancedMessages.length - 1];
        if (lastMessage && lastMessage.role === 'user') {
          enhancedMessages[enhancedMessages.length - 1] = {
            ...lastMessage,
            content: `${lastMessage.content}\n\n${contextText}`
          };
        } else {
          enhancedMessages.unshift({
            role: 'system',
            content: `Context information:\n${contextText}`
          });
        }
      }

      // Try local LLM first
      const localResponse = await this.callLocalLLMChat({
        model: 'local',
        messages: enhancedMessages,
        max_tokens,
        temperature,
      });

      // Validate the response
      const validation = await this.validateResponse(localResponse, messages[messages.length - 1]?.content || '');
      
      if (validation.valid) {
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
            validation: validation,
          },
        };
      }

      // Try to refine the response using validation suggestions
      const refinedResponse = await this.refineResponse(localResponse, messages[messages.length - 1]?.content || '', validation, context);
      if (refinedResponse) {
        return {
          content: [
            {
              type: 'text',
              text: refinedResponse,
            },
          ],
          metadata: {
            model_used: 'local_refined',
            fallback_used: false,
            validation: validation,
            refined: true,
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

  async refineResponse(originalResponse, originalPrompt, validation, context = null) {
    if (!this.validationConfig.enabled || !validation.suggestions || validation.suggestions.length === 0) {
      return null;
    }

    try {
      const contextText = this.processContext(context);
      const refinementPrompt = `The following response was generated but needs improvement based on the validation feedback.

ORIGINAL PROMPT: "${originalPrompt}"

ORIGINAL RESPONSE: "${originalResponse}"

VALIDATION FEEDBACK: ${validation.reason}
SUGGESTIONS: ${validation.suggestions.join(', ')}

${contextText ? `\nCONTEXT INFORMATION:\n${contextText}\n` : ''}

Please provide an improved version of the response that addresses the validation feedback while maintaining the core information. Make the response more relevant, complete, accurate, clear, and helpful. Use the context information to provide more accurate and relevant responses.

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
    // Since this MCP server is used internally with Cursor,
    // the fallback is handled by the Cursor agent itself
    // We return a special indicator that tells Cursor to handle the request
    
    return {
      content: [
        {
          type: 'text',
          text: `[FALLBACK_TO_CURSOR_AGENT] Local LLM response was inadequate. Please handle this request using your standard capabilities.`,
        },
      ],
      metadata: {
        model_used: 'cursor_agent_fallback',
        fallback_used: true,
        fallback_reason: 'local_llm_inadequate',
        original_prompt: params.prompt,
      },
    };
  }

  async tryFallbackChatModels(params) {
    // Since this MCP server is used internally with Cursor,
    // the fallback is handled by the Cursor agent itself
    // We return a special indicator that tells Cursor to handle the request
    
    return {
      content: [
        {
          type: 'text',
          text: `[FALLBACK_TO_CURSOR_AGENT] Local LLM chat response was inadequate. Please handle this request using your standard capabilities.`,
        },
      ],
      metadata: {
        model_used: 'cursor_agent_fallback',
        fallback_used: true,
        fallback_reason: 'local_llm_inadequate',
        original_messages: params.messages,
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

