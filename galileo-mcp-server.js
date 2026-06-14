#!/usr/bin/env node
/**
 * Galileo MCP Server
 * Generated from HAR traffic analysis of galileo-v2.onrender.com
 *
 * Usage:
 *   npm install @modelcontextprotocol/sdk node-fetch
 *   node galileo-mcp-server.js
 *
 * Add to Claude Desktop config:
 * {
 *   "mcpServers": {
 *     "galileo": {
 *       "command": "node",
 *       "args": ["/path/to/galileo-mcp-server.js"]
 *     }
 *   }
 * }
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const GAS_URL =
  "https://script.google.com/macros/s/AKfycbzKKk_M0noXnKrniCsBDO4dAUWPDkpK8YH0QhhpJQfSaCyfqmAQlLJOb-sN5atSj5nj/exec";

// Default sheetId (operator/client sheet) — override per call if needed
const DEFAULT_SHEET_ID = "1NthErqOJOFHJ482q3zg2daFX9SGCFeByXjdoZxvV-no";

// MGMT sheet (for admin-level calls like getMgmtClients, getSuperMessages)
const MGMT_SHEET_ID = "17jNBWSAkW17zfz4o2gY3wOsERa3_NAgSZ3b9HPkNspk";

// ─── GAS CALLER ───────────────────────────────────────────────────────────────
async function callGAS(action, extraParams = {}, sheetId = DEFAULT_SHEET_ID) {
  const body = JSON.stringify({ action, sheetId, ...extraParams });

  const response = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" }, // GAS requires text/plain
    body,
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`GAS error: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

// ─── TOOL DEFINITIONS ─────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "get_bootstrap_data",
    description: "טוען נתוני bootstrap ראשוניים של המערכת",
    inputSchema: {
      type: "object",
      properties: {
        sheetId: { type: "string", description: "Sheet ID של הלקוח (אופציונלי)" },
      },
    },
    handler: async ({ sheetId }) => callGAS("getBootstrapData", {}, sheetId),
  },
  {
    name: "get_users",
    description: "מחזיר את כל המשתמשים של חשבון (operators, admins)",
    inputSchema: {
      type: "object",
      properties: {
        sheetId: { type: "string", description: "Sheet ID של הלקוח" },
      },
    },
    handler: async ({ sheetId }) => callGAS("getUsers", {}, sheetId),
  },
  {
    name: "get_operator_issues",
    description: "מחזיר תקלות/בעיות של מפעיל — שם לקוח, סוג תקלה, סטטוס, תאריך",
    inputSchema: {
      type: "object",
      properties: {
        sheetId: { type: "string", description: "Sheet ID של המפעיל" },
      },
    },
    handler: async ({ sheetId }) => callGAS("getOperatorIssues", {}, sheetId),
  },
  {
    name: "get_tasks",
    description: "מחזיר משימות פתוחות ומוגמרות",
    inputSchema: {
      type: "object",
      properties: {
        sheetId: { type: "string", description: "Sheet ID" },
      },
    },
    handler: async ({ sheetId }) => callGAS("getTasks", {}, sheetId),
  },
  {
    name: "get_admin_orders",
    description: "מחזיר הזמנות admin — כולל תאריך, לקוח, מפעיל, סטטוס",
    inputSchema: {
      type: "object",
      properties: {
        sheetId: { type: "string", description: "Sheet ID" },
      },
    },
    handler: async ({ sheetId }) => callGAS("getAdminOrders", {}, sheetId),
  },
  {
    name: "get_reports",
    description: "מחזיר דוחות טיפול בטווח תאריכים",
    inputSchema: {
      type: "object",
      required: ["fromDate", "toDate"],
      properties: {
        fromDate: { type: "string", description: "תאריך התחלה YYYY-MM-DD" },
        toDate: { type: "string", description: "תאריך סיום YYYY-MM-DD" },
        limit: { type: "number", description: "מקסימום תוצאות (ברירת מחדל 300)" },
        sheetId: { type: "string", description: "Sheet ID" },
      },
    },
    handler: async ({ fromDate, toDate, limit = 300, sheetId }) =>
      callGAS("getReports", { fromDate, toDate, limit }, sheetId),
  },
  {
    name: "get_last_readings",
    description: "מחזיר קריאות אחרונות של ריכוזי כלור/pH לכל הבריכות",
    inputSchema: {
      type: "object",
      properties: {
        sheetId: { type: "string", description: "Sheet ID" },
      },
    },
    handler: async ({ sheetId }) => callGAS("getLastReadings", {}, sheetId),
  },
  {
    name: "get_client_settings",
    description: "מחזיר הגדרות לקוח ספציפי",
    inputSchema: {
      type: "object",
      properties: {
        sheetId: { type: "string", description: "Sheet ID של הלקוח" },
      },
    },
    handler: async ({ sheetId }) => callGAS("getClientSettings", {}, sheetId),
  },
  {
    name: "get_mgmt_clients",
    description: "מחזיר את כל הלקוחות ממסד הניהול (MGMT sheet) — שימוש admin בלבד",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async () => callGAS("getMgmtClients", {}, MGMT_SHEET_ID),
  },
  {
    name: "get_super_messages",
    description: "מחזיר הודעות super/broadcast — שימוש admin",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "סינון לנמען מסוים (ריק = הכל)" },
      },
    },
    handler: async ({ to = "" }) =>
      callGAS("getSuperMessages", { to }, MGMT_SHEET_ID),
  },
  {
    name: "get_sub_operator_shares",
    description: "מחזיר שיתופים של sub-operators",
    inputSchema: {
      type: "object",
      properties: {
        sheetId: { type: "string", description: "Sheet ID" },
      },
    },
    handler: async ({ sheetId }) =>
      callGAS("getSubOperatorShares", {}, sheetId),
  },
  {
    name: "get_sub_operator_approvals",
    description: "מחזיר הזמנות שדורשות אישור מ-sub-operators",
    inputSchema: {
      type: "object",
      properties: {
        sheetId: { type: "string", description: "Sheet ID" },
      },
    },
    handler: async ({ sheetId }) =>
      callGAS("getSubOperatorApprovals", {}, sheetId),
  },
  {
    name: "get_pending_sub_reports",
    description: "מחזיר דוחות sub-operator שממתינים לאישור",
    inputSchema: {
      type: "object",
      properties: {
        sheetId: { type: "string", description: "Sheet ID" },
      },
    },
    handler: async ({ sheetId }) =>
      callGAS("getPendingSubReports", {}, sheetId),
  },
  {
    name: "save_supply_db",
    description: "שומר/מעדכן מאגר ציוד/תשומות (supply DB)",
    inputSchema: {
      type: "object",
      required: ["rows"],
      properties: {
        rows: {
          type: "array",
          description: "מערך שורות לשמירה (פורמט תואם לגיליון)",
          items: { type: "array" },
        },
        sheetId: { type: "string", description: "Sheet ID" },
      },
    },
    handler: async ({ rows, sheetId }) =>
      callGAS("saveSupplyDB", { rows }, sheetId),
  },
];

// ─── MCP SERVER ───────────────────────────────────────────────────────────────
const server = new Server(
  { name: "galileo-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const tool = TOOLS.find((t) => t.name === name);

  if (!tool) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  try {
    const result = await tool.handler(args || {});
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

// ─── START ────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Galileo MCP Server running");
