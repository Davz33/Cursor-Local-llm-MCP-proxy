# Release Notes v1.2.0 - Real-time Information & Orchestration Rules

**Release Date**: January 2025  
**Version**: 1.2.0  
**Type**: Minor Release (Backward Compatible)

## 🎉 Major Features

### 🌐 Real-time Information with Perplexity Sonar API
- **Live Data Access**: Get current events, news, market data, and real-time information
- **Web Search Priority**: Automatic routing of web search queries to Sonar API
- **Citation Support**: Responses include source citations for verification
- **Multiple Models**: Support for sonar-pro, sonar-online, sonar-medium-online, sonar-small-online
- **Environment Configuration**: Flexible API key management with multiple environment variable names

### 🎯 Enhanced MCP Orchestrator
- **Dual Rule System**: Separated general functionality rules from personal preferences
- **Repository Tracking**: General rules are now version-controlled and shared
- **Personal Customization**: User-specific rules remain in home directory
- **Intelligent Tool Selection**: Improved rule-based logic for tool selection
- **Web Search Patterns**: Refactored and generalized web search detection system

### 🛠 New MCP Tools
- **`sonar_query`**: Real-time information gathering with Perplexity Sonar API
- **Enhanced orchestration tools**: Improved `delegate_to_local_llm`, `orchestrator_status`, `list_orchestrated_tools`, `call_orchestrated_tool`

## 🔧 Technical Improvements

### Orchestration Rules System
- **General Rules**: `src/orchestrator/general-orchestration-rules.txt` (repository-tracked)
- **Personal Rules**: `$HOME/local-llm-proxy/personal-orchestration-rules.txt` (user-specific)
- **Environment Variables**: `MCP_PERSONAL_RULES_PATH` for custom rule locations
- **Rule Combination**: Automatic merging of general and personal rules
- **Fallback Handling**: Graceful degradation when rule files are missing

### Web Search Enhancement
- **Pattern Management**: `src/orchestrator/web-search-patterns.ts` with priority-based patterns
- **General Patterns**: Removed specific city/country names for broader applicability
- **Priority System**: 1-9 priority levels for pattern matching
- **Automatic Sorting**: Patterns sorted by priority for optimal matching

### Sonar API Integration
- **Multiple API Key Support**: `PERPLEXITY_API_KEY`, `SONAR_API_KEY`, `PERPLEXITY_SONAR_API_KEY`
- **Environment Configuration**: `.env` file support with `dotenv` integration
- **Error Handling**: Robust error handling with proper type assertions
- **Streaming Support**: Built-in support for streaming responses

## 📚 Documentation Updates

### New Documentation Files
- **`SONAR_INTEGRATION_README.md`**: Comprehensive Sonar API setup and usage guide
- **`env.example`**: Template for environment variable configuration
- **Enhanced README.md**: Updated with orchestration rules system and Sonar integration

### Documentation Improvements
- **Orchestration Rules System**: Detailed explanation of dual-rule architecture
- **Sonar API Setup**: Step-by-step configuration instructions
- **Mermaid Workflow**: Updated diagram including Sonar API integration
- **Feature Descriptions**: Enhanced descriptions of MCP orchestrator capabilities

## 🔄 Workflow Enhancements

### Updated Mermaid Diagram
- **Sonar Integration**: Added Sonar API and real-time data components
- **Tool Layer**: Enhanced with Sonar tool and real-time data flow
- **Data Flow**: Updated numbering and connections for new components

### Environment Configuration
- **Flexible API Keys**: Multiple environment variable names supported
- **Documentation**: Clear setup instructions for API key configuration
- **Security**: Best practices for API key management

## 🚀 Performance & Reliability

### Orchestration Improvements
- **Rule Loading**: Efficient loading and combination of rule files
- **Error Handling**: Improved error reporting and fallback mechanisms
- **Tool Selection**: More intelligent tool selection based on query analysis
- **Web Search Routing**: Automatic detection and routing of web search queries

### Sonar API Optimization
- **Response Handling**: Proper JSON parsing with type assertions
- **Error Recovery**: Graceful handling of API errors and timeouts
- **Model Selection**: Intelligent model selection based on query type

## 🔧 Configuration Changes

### New Environment Variables
- `PERPLEXITY_API_KEY`: Primary API key for Sonar API access
- `SONAR_API_KEY`: Alternative API key name
- `PERPLEXITY_SONAR_API_KEY`: Alternative API key name
- `MCP_PERSONAL_RULES_PATH`: Custom path for personal orchestration rules

### File Structure Changes
- **New Files**: `src/orchestrator/general-orchestration-rules.txt`, `src/orchestrator/web-search-patterns.ts`
- **Updated Files**: `src/orchestrator/orchestrator-service.ts`, `src/services/sonar-service.ts`
- **Documentation**: Enhanced README.md with new sections

## 🎯 Use Cases

### Real-time Information
- **News & Events**: Get current news and events from any location
- **Market Data**: Access real-time financial and market information
- **Weather**: Current weather conditions and forecasts
- **Research**: Up-to-date information for research and analysis

### Enhanced Orchestration
- **Personalized Rules**: Customize orchestration behavior without affecting core functionality
- **Web Search Priority**: Automatic handling of web search queries
- **Tool Selection**: More intelligent tool selection based on comprehensive rules
- **Fallback Communication**: Better error reporting and fallback mechanisms

## 🔄 Migration Guide

### For Existing Users
1. **No Breaking Changes**: All existing functionality remains unchanged
2. **Optional Sonar Setup**: Sonar API integration is optional
3. **Rule Migration**: Existing rules will continue to work
4. **Environment Variables**: New variables are optional

### For New Users
1. **Sonar API**: Follow `SONAR_INTEGRATION_README.md` for setup
2. **Environment Setup**: Use `env.example` as a template
3. **Rule Customization**: Create personal rules in `$HOME/local-llm-proxy/`
4. **Documentation**: Refer to updated README.md for comprehensive guidance

## 🐛 Bug Fixes

### Web Search Delegation
- **Fixed**: Cursor no longer uses internal web search when delegating to local-llm-proxy
- **Fixed**: Sonar query is now used as primary tool for web searches, not fallback
- **Fixed**: Improved web search pattern detection and routing

### Orchestration Rules
- **Fixed**: Proper rule file loading and combination
- **Fixed**: Graceful handling of missing rule files
- **Fixed**: Improved error reporting for rule loading issues

## 🔮 Future Roadmap

### Planned Features
- **Additional APIs**: Integration with more real-time data sources
- **Rule Templates**: Pre-built rule templates for common use cases
- **Advanced Patterns**: More sophisticated web search pattern matching
- **Performance Monitoring**: Enhanced monitoring and analytics

### Community Contributions
- **Rule Sharing**: Community-contributed rule sets
- **Pattern Library**: Shared web search patterns
- **Documentation**: Community-driven documentation improvements

## 📊 Statistics

- **New Files**: 4 (Sonar service, general rules, web patterns, Sonar README)
- **Updated Files**: 6 (orchestrator service, MCP server, README, package.json, etc.)
- **New MCP Tools**: 1 (sonar_query)
- **Enhanced Tools**: 4 (orchestration tools)
- **Documentation Pages**: 2 (Sonar integration guide, updated README)

## 🎉 Conclusion

Version 1.2.0 represents a significant enhancement to the local-llm-proxy MCP server, introducing real-time information capabilities through Perplexity Sonar API integration and a sophisticated orchestration rules system. These features provide users with powerful tools for accessing current information while maintaining the flexibility to customize their orchestration experience.

The dual-rule system ensures that core functionality remains stable and shared while allowing personal customization, and the Sonar API integration opens up new possibilities for real-time data access and web search capabilities.

---

**Full Changelog**: https://github.com/Davz33/Cursor-Local-llm-MCP-proxy/compare/v1.1.0...v1.2.0
