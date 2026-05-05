import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
function loadMemory(configPath) {
    try {
        if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, "utf-8");
            return JSON.parse(content);
        }
    }
    catch (error) {
        console.error("[StarMenory] Failed to load memory:", error);
    }
    return null;
}
function formatMemoryForPrompt(memory) {
    const sections = [];
    sections.push("[LONG-TERM MEMORY]");
    if (memory.user?.preferences) {
        const prefs = memory.user.preferences;
        sections.push("\n[USER PREFERENCES]");
        for (const [key, value] of Object.entries(prefs)) {
            sections.push(`- ${key}: ${value}`);
        }
        sections.push("[/USER PREFERENCES]");
    }
    if (memory.strict?.forbiddenCommands?.length > 0) {
        sections.push("\n[STRICT - NEVER VIOLATE]");
        for (const cmd of memory.strict.forbiddenCommands) {
            sections.push(`- ${cmd.description}: \`${cmd.pattern}\``);
        }
        if (memory.strict.rules?.length > 0) {
            sections.push("\nStrict Rules:");
            for (const rule of memory.strict.rules) {
                sections.push(`- ${rule}`);
            }
        }
        sections.push("[/STRICT]");
    }
    sections.push("\n[/LONG-TERM MEMORY]");
    return sections.join("\n");
}
const MEMORY_MANAGER_PATH = path.join(process.env.USERPROFILE || "", ".agents", "skills", "memory-manager", "memory-manager.js");
const MEMORY_KEYWORD_PATTERNS = [
    /remember/i,
    /记住/i,
    /save\s+this/i,
    /别忘/i,
    /不要忘/i,
    /一直用/i,
    /总是用/i,
    /偏好/i,
    /以后都/i,
];
const NUDGE_MESSAGE = `[MEMORY TRIGGER DETECTED]

The user wants you to remember something. You MUST automatically save this to long-term memory.

1. Summarize the key information concisely (within 50 characters for preferences, 100 characters for rules)
2. Use the \`memory\` tool to save:
   - For preferences: action="add", category="user.preferences", key="<key>", value="<value>"
   - For rules: action="add", category="strict.rules", value="<rule>"
   - For forbidden commands: action="add", category="strict.forbidden", key="<description>", value="<description>", extra="<pattern>"

Do NOT ask for confirmation. Just save it automatically.`;
function detectMemoryKeyword(text) {
    return MEMORY_KEYWORD_PATTERNS.some((pattern) => pattern.test(text));
}
function callMemoryManager(args) {
    try {
        const output = execSync(`node "${MEMORY_MANAGER_PATH}" ${args.join(" ")}`, {
            encoding: "utf-8",
            maxBuffer: 1024 * 1024,
        });
        return JSON.parse(output);
    }
    catch (error) {
        return { success: false, error: error.message || "Failed to call memory-manager" };
    }
}
export const StarMenory = async (input) => {
    const homeDir = process.env.USERPROFILE || process.env.HOME || "";
    const configPath = path.join(homeDir, ".config", "opencode", "memory.json");
    const memory = loadMemory(configPath);
    if (!memory) {
        console.log("[StarMenory] No memory file found at", configPath);
    }
    else {
        console.log("[StarMenory] Memory loaded successfully");
    }
    return {
        tool: {
            memory: tool({
                description: "管理长期记忆：查看、添加、更新、删除记忆内容",
                args: {
                    action: tool.schema.enum(["view", "add", "update", "delete", "search"]),
                    category: tool.schema.string().optional(),
                    key: tool.schema.string().optional(),
                    value: tool.schema.string().optional(),
                    extra: tool.schema.string().optional(),
                },
                async execute(args) {
                    const { action, category, key, value, extra } = args;
                    const cmdArgs = [action];
                    if (category)
                        cmdArgs.push(category);
                    if (key)
                        cmdArgs.push(key);
                    if (value)
                        cmdArgs.push(value);
                    if (extra)
                        cmdArgs.push(extra);
                    const result = callMemoryManager(cmdArgs);
                    return JSON.stringify(result, null, 2);
                },
            }),
        },
        "experimental.chat.system.transform": async (chatInput, output) => {
            if (!memory)
                return;
            const memoryContext = formatMemoryForPrompt(memory);
            if (!memoryContext)
                return;
            output.system.push(memoryContext);
        },
        "chat.message": async (chatInput, output) => {
            if (!memory)
                return;
            const textParts = output.parts.filter((p) => p.type === "text");
            const userMessage = textParts.map((p) => p.text).join("\n");
            if (detectMemoryKeyword(userMessage)) {
                console.log("[StarMenory] Memory keyword detected, nudging agent");
                const nudgePart = {
                    id: `prt_memory_nudge_${Date.now()}`,
                    sessionID: chatInput.sessionID,
                    messageID: output.message.id,
                    type: "text",
                    text: NUDGE_MESSAGE,
                    synthetic: true,
                };
                output.parts.push(nudgePart);
            }
        },
    };
};