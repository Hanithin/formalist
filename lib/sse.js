/**
 * sse.js — Unified SSE (Server-Sent Events) client management
 * Handles both formalite message streams and support streams
 */

const sseClients = new Map();     // formaliteId → Set<{res, userId}>
const supportSSEClients = new Map(); // userId → Set<{res}>

function addSSEClient(formaliteId, res, userId) {
  const key = String(formaliteId);
  if (!sseClients.has(key)) sseClients.set(key, new Set());
  const client = { res, userId };
  sseClients.get(key).add(client);
  res.on("close", () => {
    const set = sseClients.get(key);
    if (set) {
      set.delete(client);
      if (set.size === 0) sseClients.delete(key);
    }
  });
}

function broadcastMessage(formaliteId, message) {
  const set = sseClients.get(String(formaliteId));
  if (!set) return;
  const data = JSON.stringify(message);
  for (const client of set) {
    client.res.write(`data: ${data}\n\n`);
  }
}

function addSupportSSEClient(userId, res) {
  const key = String(userId);
  if (!supportSSEClients.has(key)) supportSSEClients.set(key, new Set());
  const client = { res };
  supportSSEClients.get(key).add(client);
  res.on("close", () => {
    const set = supportSSEClients.get(key);
    if (set) {
      set.delete(client);
      if (set.size === 0) supportSSEClients.delete(key);
    }
  });
}

function broadcastSupportMessage(userId, message) {
  const set = supportSSEClients.get(String(userId));
  if (!set) return;
  const data = JSON.stringify(message);
  for (const client of set) {
    client.res.write(`data: ${data}\n\n`);
  }
}

module.exports = { addSSEClient, broadcastMessage, addSupportSSEClient, broadcastSupportMessage };
