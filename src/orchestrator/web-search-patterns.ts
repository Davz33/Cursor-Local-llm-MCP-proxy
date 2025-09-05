/**
 * Web Search Patterns Configuration
 *
 * This file contains patterns that indicate when a query should be routed
 * to web search tools (like Sonar) for real-time information gathering.
 *
 * Patterns should be general and not include specific names, locations, or entities.
 */

export interface WebSearchPattern {
  /** The pattern to match against the prompt */
  pattern: string;
  /** Description of what this pattern indicates */
  description: string;
  /** Priority level (higher = more important) */
  priority: number;
}

/**
 * General web search patterns that indicate real-time information needs
 */
export const WEB_SEARCH_PATTERNS: WebSearchPattern[] = [
  // Time-based patterns
  {
    pattern: "recent",
    description: "Indicates need for recent information",
    priority: 8,
  },
  {
    pattern: "latest",
    description: "Indicates need for latest information",
    priority: 8,
  },
  {
    pattern: "current",
    description: "Indicates need for current information",
    priority: 8,
  },
  {
    pattern: "today",
    description: "Indicates need for today's information",
    priority: 9,
  },
  {
    pattern: "now",
    description: "Indicates need for current moment information",
    priority: 9,
  },
  {
    pattern: "2024",
    description: "Indicates need for current year information",
    priority: 7,
  },
  {
    pattern: "2025",
    description: "Indicates need for current year information",
    priority: 7,
  },

  // News and events patterns
  {
    pattern: "news",
    description: "Indicates need for news information",
    priority: 9,
  },
  {
    pattern: "what happened",
    description: "Indicates need for event information",
    priority: 8,
  },
  {
    pattern: "what is happening",
    description: "Indicates need for current event information",
    priority: 8,
  },
  {
    pattern: "breaking",
    description: "Indicates need for breaking news",
    priority: 9,
  },
  {
    pattern: "update",
    description: "Indicates need for updates",
    priority: 7,
  },
  {
    pattern: "developments",
    description: "Indicates need for recent developments",
    priority: 8,
  },
  {
    pattern: "events",
    description: "Indicates need for event information",
    priority: 7,
  },

  // Data and information patterns
  {
    pattern: "weather",
    description: "Indicates need for weather information",
    priority: 8,
  },
  {
    pattern: "market",
    description: "Indicates need for market information",
    priority: 8,
  },
  {
    pattern: "stock",
    description: "Indicates need for stock information",
    priority: 8,
  },
  {
    pattern: "price",
    description: "Indicates need for price information",
    priority: 7,
  },
  {
    pattern: "forecast",
    description: "Indicates need for forecast information",
    priority: 8,
  },
  {
    pattern: "prediction",
    description: "Indicates need for prediction information",
    priority: 7,
  },
  {
    pattern: "trends",
    description: "Indicates need for trend information",
    priority: 7,
  },
  {
    pattern: "statistics",
    description: "Indicates need for statistical information",
    priority: 7,
  },
  {
    pattern: "data",
    description: "Indicates need for data information",
    priority: 6,
  },

  // Search and lookup patterns
  {
    pattern: "search",
    description: "Indicates need for search functionality",
    priority: 8,
  },
  {
    pattern: "find",
    description: "Indicates need for finding information",
    priority: 7,
  },
  {
    pattern: "look up",
    description: "Indicates need for looking up information",
    priority: 7,
  },
  {
    pattern: "information",
    description: "Indicates need for information",
    priority: 6,
  },

  // Location-based patterns (general)
  {
    pattern: "city",
    description: "Indicates need for city information",
    priority: 6,
  },
  {
    pattern: "location",
    description: "Indicates need for location information",
    priority: 6,
  },
  {
    pattern: "place",
    description: "Indicates need for place information",
    priority: 6,
  },
];

/**
 * Get web search patterns sorted by priority (highest first)
 */
export function getWebSearchPatterns(): WebSearchPattern[] {
  return [...WEB_SEARCH_PATTERNS].sort((a, b) => b.priority - a.priority);
}

/**
 * Get pattern strings for matching (sorted by priority)
 */
export function getWebSearchPatternStrings(): string[] {
  return getWebSearchPatterns().map((p) => p.pattern);
}

/**
 * Check if a prompt contains web search patterns
 */
export function isWebSearchQuery(prompt: string): boolean {
  const promptLower = prompt.toLowerCase();
  const patterns = getWebSearchPatternStrings();

  return patterns.some((pattern) => promptLower.includes(pattern));
}

/**
 * Get the highest priority pattern found in a prompt
 */
export function getHighestPriorityPattern(
  prompt: string,
): WebSearchPattern | null {
  const promptLower = prompt.toLowerCase();
  const patterns = getWebSearchPatterns();

  for (const pattern of patterns) {
    if (promptLower.includes(pattern.pattern)) {
      return pattern;
    }
  }

  return null;
}

/**
 * Get all matching patterns for a prompt with their priorities
 */
export function getMatchingPatterns(prompt: string): WebSearchPattern[] {
  const promptLower = prompt.toLowerCase();
  const patterns = getWebSearchPatterns();

  return patterns.filter((pattern) => promptLower.includes(pattern.pattern));
}
