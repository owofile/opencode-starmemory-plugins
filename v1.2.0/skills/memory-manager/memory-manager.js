#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const MEMORY_PATH = path.join(process.env.USERPROFILE || "", ".config", "opencode", "memory.json");

function loadMemory() {
  try {
    if (fs.existsSync(MEMORY_PATH)) {
      const content = fs.readFileSync(MEMORY_PATH, "utf-8");
      return JSON.parse(content);
    }
  } catch (error) {
    console.error("[memory-manager] Failed to load:", error);
  }
  return null;
}

function saveMemory(memory) {
  try {
    fs.writeFileSync(MEMORY_PATH, JSON.stringify(memory, null, 2), "utf-8");
    return true;
  } catch (error) {
    console.error("[memory-manager] Failed to save:", error);
    return false;
  }
}

function generateId(prefix) {
  return `${prefix}_${Date.now().toString(36)}`;
}

const command = process.argv[2];
const args = process.argv.slice(3);

const memory = loadMemory();
if (!memory) {
  console.log(JSON.stringify({ success: false, error: "Memory file not found" }));
  process.exit(1);
}

let result;

switch (command) {
  case "view": {
    const category = args[0] || "all";
    if (category === "all") {
      result = { success: true, data: memory };
    } else if (category === "user") {
      result = { success: true, data: memory.user };
    } else if (category === "strict") {
      result = { success: true, data: memory.strict };
    } else if (category === "projects") {
      result = { success: true, data: memory.projects };
    } else {
      result = { success: false, error: `Unknown category: ${category}` };
    }
    break;
  }

  case "add": {
    const [category, key, value, extra] = args;
    if (!category || !key || !value) {
      result = { success: false, error: "Usage: memory-manager add <category> <key> <value> [extra]" };
      break;
    }

    if (category === "user.preferences") {
      if (!memory.user.preferences) memory.user.preferences = {};
      memory.user.preferences[key] = value;
    } else if (category === "strict.rules") {
      if (!memory.strict.rules) memory.strict.rules = [];
      memory.strict.rules.push(value);
    } else if (category === "strict.forbidden") {
      if (!memory.strict.forbiddenCommands) memory.strict.forbiddenCommands = [];
      const id = generateId("forbid");
      memory.strict.forbiddenCommands.push({
        id,
        pattern: extra || "",
        description: value,
        severity: "critical",
      });
    } else {
      result = { success: false, error: `Unknown category: ${category}` };
      break;
    }

    if (saveMemory(memory)) {
      result = { success: true, message: `Added ${key} to ${category}` };
    } else {
      result = { success: false, error: "Failed to save" };
    }
    break;
  }

  case "update": {
    const [category, key, newValue] = args;
    if (!category || !key || !newValue) {
      result = { success: false, error: "Usage: memory-manager update <category> <key> <newValue>" };
      break;
    }

    if (category === "user.preferences") {
      if (memory.user.preferences && memory.user.preferences[key]) {
        memory.user.preferences[key] = newValue;
        if (saveMemory(memory)) {
          result = { success: true, message: `Updated ${key}` };
        } else {
          result = { success: false, error: "Failed to save" };
        }
      } else {
        result = { success: false, error: `Key not found: ${key}` };
      }
    } else {
      result = { success: false, error: `Unknown category: ${category}` };
    }
    break;
  }

  case "delete": {
    const [category, key, extra] = args;
    if (!category || !key) {
      result = { success: false, error: "Usage: memory-manager delete <category> <key>" };
      break;
    }

    if (category === "strict.rules") {
      if (memory.strict.rules) {
        const idx = memory.strict.rules.indexOf(key);
        if (idx !== -1) {
          memory.strict.rules.splice(idx, 1);
          if (saveMemory(memory)) {
            result = { success: true, message: `Deleted rule: ${key}` };
          } else {
            result = { success: false, error: "Failed to save" };
          }
        } else {
          result = { success: false, error: `Rule not found: ${key}` };
        }
      } else {
        result = { success: false, error: "No rules found" };
      }
    } else if (category === "strict.forbidden") {
      if (memory.strict.forbiddenCommands) {
        const idx = memory.strict.forbiddenCommands.findIndex((c) => c.id === key);
        if (idx !== -1) {
          const deleted = memory.strict.forbiddenCommands.splice(idx, 1)[0];
          if (saveMemory(memory)) {
            result = { success: true, message: `Deleted forbidden: ${deleted.description}` };
          } else {
            result = { success: false, error: "Failed to save" };
          }
        } else {
          result = { success: false, error: `Forbidden command not found: ${key}` };
        }
      } else {
        result = { success: false, error: "No forbidden commands found" };
      }
    } else if (category.startsWith("user.preferences.")) {
      const prefKey = category.replace("user.preferences.", "");
      if (memory.user?.preferences && prefKey in memory.user.preferences) {
        delete memory.user.preferences[prefKey];
        if (saveMemory(memory)) {
          result = { success: true, message: `Deleted user.preferences.${prefKey}` };
        } else {
          result = { success: false, error: "Failed to save" };
        }
      } else {
        result = { success: false, error: `Preference key not found: ${prefKey}` };
      }
    } else if (category === "user.preferences") {
      if (memory.user?.preferences && key in memory.user.preferences) {
        delete memory.user.preferences[key];
        if (saveMemory(memory)) {
          result = { success: true, message: `Deleted user.preferences.${key}` };
        } else {
          result = { success: false, error: "Failed to save" };
        }
      } else {
        result = { success: false, error: `Preference key not found: ${key}` };
      }
    } else {
      result = { success: false, error: `Unknown category: ${category}` };
    }
    break;
  }

  case "search": {
    const [query] = args;
    if (!query) {
      result = { success: false, error: "Usage: memory-manager search <query>" };
      break;
    }

    const queryLower = query.toLowerCase();
    const matches = [];

    if (memory.user?.preferences) {
      for (const [key, value] of Object.entries(memory.user.preferences)) {
        if (key.toLowerCase().includes(queryLower) || String(value).toLowerCase().includes(queryLower)) {
          matches.push(`user.preferences.${key}: ${value}`);
        }
      }
    }

    if (memory.strict?.rules) {
      for (const rule of memory.strict.rules) {
        if (rule.toLowerCase().includes(queryLower)) {
          matches.push(`strict.rules: ${rule}`);
        }
      }
    }

    if (memory.strict?.forbiddenCommands) {
      for (const cmd of memory.strict.forbiddenCommands) {
        if (cmd.description.toLowerCase().includes(queryLower) || cmd.pattern.toLowerCase().includes(queryLower)) {
          matches.push(`strict.forbidden.${cmd.id}: ${cmd.description} (${cmd.pattern})`);
        }
      }
    }

    result = { success: true, data: matches };
    break;
  }

  default:
    result = {
      success: false,
      error: `Unknown command: ${command}. Use: view | add | update | delete | search`,
    };
}

console.log(JSON.stringify(result, null, 2));