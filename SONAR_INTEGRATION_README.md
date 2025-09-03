# Perplexity Sonar API Integration

This document describes the integration of Perplexity's Sonar API into the local-llm-proxy MCP server for real-time information gathering.

## Overview

The Sonar integration provides access to Perplexity's real-time search and AI capabilities, allowing the MCP orchestrator to gather current information, news, and up-to-date data with proper citations.

## Features

- **Real-time Information**: Access to current events, news, and recent developments
- **Citations**: All responses include proper source citations
- **Multiple Models**: Support for different Sonar models (sonar-pro, sonar-online, etc.)
- **Cost Tracking**: API usage and cost information included in responses
- **Error Handling**: Graceful handling of API errors and missing credentials

## Setup

### 1. Get Perplexity API Key

1. Visit [Perplexity API Settings](https://www.perplexity.ai/settings/api)
2. Generate a new API key
3. Copy the API key for configuration

### 2. Configure Environment Variables

Create a `.env` file in the project root:

```bash
# Perplexity API Configuration
PERPLEXITY_API_KEY=your_perplexity_api_key_here
```

Alternative environment variable names (any of these will work):
- `SONAR_API_KEY`
- `PERPLEXITY_SONAR_API_KEY`

### 3. Available Models

The integration supports these Sonar models:
- `sonar-pro` (default) - Most capable model
- `sonar-online` - Online search capabilities
- `sonar-medium-online` - Balanced performance
- `sonar-small-online` - Faster, smaller model

## Usage

### MCP Tool: `sonar_query`

Query the Sonar API for real-time information:

```json
{
  "name": "sonar_query",
  "arguments": {
    "query": "What are the latest developments in AI and machine learning?",
    "max_tokens": 1000,
    "temperature": 0.7,
    "model": "sonar-pro"
  }
}
```

### Parameters

- `query` (required): The question or topic to search for
- `max_tokens` (optional): Maximum tokens to generate (default: 1000)
- `temperature` (optional): Response creativity (default: 0.7)
- `model` (optional): Sonar model to use (default: "sonar-pro")

### Response Format

The tool returns:
- **Answer**: AI-generated response with current information
- **Sources**: List of cited sources with titles, URLs, and snippets
- **Cost Information**: API usage and cost details

Example response:
```
Based on the latest information, here are the recent developments in AI...

**Sources:**
1. [Latest AI Research Paper](https://example.com/paper)
   Brief description of the source

2. [Tech News Article](https://example.com/news)
   Another source description

--- Sonar API Info ---
Cost: $0.0050
Sources: 2
```

## Integration with Orchestrator

The Sonar tool is automatically available through the MCP orchestrator and follows the orchestration rules:

### When to Use Sonar

- Current events and news
- Recent developments in technology
- Market data and financial information
- Weather and location-based information
- Any information that changes frequently
- When local knowledge or RAG storage might be outdated

### Orchestration Rules

The orchestrator will automatically select Sonar for queries that require:
- Real-time information
- Current data
- Recent developments
- News and events

## Error Handling

### Missing API Key

If no API key is configured:
```
Error querying Sonar API: Perplexity API key is required. Set PERPLEXITY_API_KEY, SONAR_API_KEY, or PERPLEXITY_SONAR_API_KEY environment variable in .env file.
```

### API Errors

The service handles various API errors gracefully:
- Rate limiting
- Invalid API key
- Network issues
- Model unavailability

## Testing

Run the test script to verify integration:

```bash
node test-sonar.js
```

The test will:
1. Check for API key configuration
2. Start the MCP server
3. Make a test Sonar API call
4. Display results and error handling

## Cost Considerations

- Each API call has a cost based on tokens used
- Cost information is included in responses
- Monitor usage through the Perplexity dashboard
- Consider using smaller models for cost optimization

## Security

- API keys are loaded from environment variables
- Never commit API keys to version control
- Use `.env` files for local development
- Rotate API keys regularly

## Troubleshooting

### Common Issues

1. **"Sonar service is not available"**
   - Check if API key is set in `.env` file
   - Verify API key is valid and active

2. **"Failed to query Sonar API"**
   - Check internet connection
   - Verify API key permissions
   - Check rate limits

3. **No sources in response**
   - Some queries may not find relevant sources
   - Try rephrasing the query
   - Check if the topic is too specific or recent

### Debug Mode

Enable debug logging by checking the server logs for:
- `MCP Server: Querying Sonar API with: [query]`
- `MCP Server: Sonar API response received with X sources`

## Future Enhancements

- Streaming response support
- Batch query processing
- Response caching
- Custom model selection based on query type
- Integration with other real-time data sources
