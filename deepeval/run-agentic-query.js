#!/usr/bin/env node

import { AgenticService } from "../dist/src/agentic/agentic-service.js";

async function readStdin() {
  let data = "";
  for await (const chunk of process.stdin) {
    data += chunk;
  }
  return data.trim();
}

async function getPayload() {
  if (!process.stdin.isTTY) {
    const stdinData = await readStdin();
    if (stdinData) {
      return JSON.parse(stdinData);
    }
  }

  const arg = process.argv[2];
  if (arg) {
    try {
      return JSON.parse(arg);
    } catch (error) {
      return { prompt: process.argv.slice(2).join(" ") };
    }
  }

  throw new Error(
    "Missing prompt input. Provide JSON via stdin or as the first argument.",
  );
}

async function main() {
  try {
    const payload = await getPayload();
    if (!payload?.prompt || typeof payload.prompt !== "string") {
      throw new Error("Payload must include a string 'prompt' field.");
    }

    if (payload.useOrchestrator) {
      process.env.ENABLE_MCP_ORCHESTRATOR = "true";
    }

    const agenticService = new AgenticService();
    await agenticService.initialize();

    const useRealLLM =
      typeof payload.useRealLLM === "boolean" ? payload.useRealLLM : true;

    if (agenticService.toolCallingService) {
      agenticService.toolCallingService.setUseRealLLM(useRealLLM);
    }

    if (Array.isArray(payload.indexTexts) && payload.indexTexts.length > 0) {
      const ragService = agenticService.getRAGService();
      for (const text of payload.indexTexts) {
        if (typeof text === "string" && text.trim().length > 0) {
          await ragService.indexText(text);
        }
      }
    }

    const useOrchestrator =
      typeof payload.useOrchestrator === "boolean"
        ? payload.useOrchestrator
        : false;

    const result = await agenticService.runAgenticQuery(payload.prompt, {
      useTools: true,
      useDynamicToolCalling: !useOrchestrator,
      useOrchestrator: useOrchestrator,
      maxTokens: payload.maxTokens ?? 500,
      temperature: payload.temperature ?? 0.7,
    });

    const output = {
      prompt: payload.prompt,
      response: result.response,
      toolsUsed: result.toolsUsed ?? [],
      toolCalls: result.toolCalls ?? [],
      metadata: result.metadata ?? {},
    };

    console.log(JSON.stringify(output));
  } catch (error) {
    console.error(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exit(1);
  }
}

await main();
