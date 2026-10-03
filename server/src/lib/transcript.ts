import fs from 'node:fs';
import { costOf, localDateOf, lookupPricing, tokensFromUsage } from '../../../shared/pricing.ts';
import type { TokenTotals, Transcript, TranscriptItem } from '../../../shared/types.ts';
import { describeTool, promptOf } from '../ingest/parse.ts';

const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_RESULT_CHARS = 12_000;
const MAX_TEXT_CHARS = 60_000;

const clip = (s: string, n: number) => (s.length > n ? { text: s.slice(0, n), truncated: true } : { text: s, truncated: false });

function resultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b: any) => (b?.type === 'text' ? String(b.text ?? '') : b?.type === 'image' ? '[image]' : ''))
      .filter(Boolean)
      .join('\n');
  }
  return content == null ? '' : JSON.stringify(content);
}

/** Turn a raw JSONL transcript into a readable, render-ready event list. */
export function readTranscript(file: string): Transcript {
  let raw: string;
  let truncated = false;
  try {
    const st = fs.statSync(file);
    if (st.size > MAX_FILE_BYTES) {
      // Keep the tail: recent activity matters most for very long sessions.
      const fd = fs.openSync(file, 'r');
      const buf = Buffer.alloc(MAX_FILE_BYTES);
      fs.readSync(fd, buf, 0, MAX_FILE_BYTES, st.size - MAX_FILE_BYTES);
      fs.closeSync(fd);
      raw = buf.toString('utf8');
      raw = raw.slice(raw.indexOf('\n') + 1);
      truncated = true;
    } else {
      raw = fs.readFileSync(file, 'utf8');
    }
  } catch {
    return { items: [], truncated: false };
  }

  const items: TranscriptItem[] = [];
  const toolsById = new Map<string, Extract<TranscriptItem, { kind: 'tool' }>>();
  let turn = new Map<string, { cost: number; tokens: TokenTotals; model: string; ts: number }>();
  let n = 0;
  const id = () => `i${n++}`;

  const flushTurn = () => {
    if (!turn.size) return;
    const tokens: TokenTotals = { input: 0, output: 0, write: 0, read: 0 };
    let cost = 0;
    let model = '';
    let ts = 0;
    for (const u of turn.values()) {
      cost += u.cost;
      tokens.input += u.tokens.input;
      tokens.output += u.tokens.output;
      tokens.write += u.tokens.write;
      tokens.read += u.tokens.read;
      model = u.model;
      ts = Math.max(ts, u.ts);
    }
    items.push({ kind: 'turn', id: id(), ts, cost, tokens, model });
    turn = new Map();
  };

  for (const line of raw.split('\n')) {
    if (!line) continue;
    let rec: any;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    const ts = rec.timestamp ? Date.parse(rec.timestamp) : null;

    if (rec.type === 'user') {
      const c = rec.message?.content;
      if (Array.isArray(c) && c.some((b: any) => b?.type === 'tool_result')) {
        for (const b of c) {
          if (b?.type !== 'tool_result') continue;
          const tool = toolsById.get(b.tool_use_id);
          if (!tool) continue;
          const r = clip(resultText(b.content), MAX_RESULT_CHARS);
          tool.result = { text: r.text, isError: !!b.is_error, truncated: r.truncated };
          const agentId = rec.toolUseResult?.agentId;
          if (typeof agentId === 'string') tool.agentId = agentId;
        }
        continue;
      }
      const p = promptOf(rec);
      if (p) {
        flushTurn();
        items.push({ kind: 'prompt', id: id(), ts, text: clip(p.text, MAX_TEXT_CHARS).text, command: p.command });
      }
      continue;
    }

    if (rec.type === 'assistant') {
      const msg = rec.message ?? {};
      const model: string = msg.model ?? '';
      if (msg.usage && model && model !== '<synthetic>' && ts) {
        const tokens = tokensFromUsage(msg.usage);
        const key = `${msg.id ?? ''}|${rec.requestId ?? ''}`;
        const rates = lookupPricing(model, localDateOf(ts), msg.usage.speed);
        turn.set(key, {
          cost: costOf(tokens, rates),
          tokens: { input: tokens.input, output: tokens.output, write: tokens.write5m + tokens.write1h, read: tokens.read },
          model,
          ts,
        });
      }
      if (!Array.isArray(msg.content)) continue;
      for (const b of msg.content) {
        if (b?.type === 'text' && b.text?.trim()) {
          items.push({ kind: 'text', id: id(), ts, text: clip(b.text, MAX_TEXT_CHARS).text, model: model || null });
        } else if (b?.type === 'thinking' && b.thinking?.trim()) {
          items.push({ kind: 'thinking', id: id(), ts, text: clip(b.thinking, MAX_TEXT_CHARS).text });
        } else if (b?.type === 'tool_use' && b.id) {
          const tool: Extract<TranscriptItem, { kind: 'tool' }> = {
            kind: 'tool',
            id: b.id,
            ts,
            name: b.name,
            summary: describeTool(b.name, b.input).detail,
            input: b.input,
            result: null,
            agentId: null,
          };
          toolsById.set(b.id, tool);
          items.push(tool);
        }
      }
      continue;
    }

    if (rec.type === 'system') {
      if (rec.subtype === 'compact_boundary') {
        items.push({ kind: 'system', id: id(), ts, text: 'Conversation compacted', level: 'info' });
      } else if ((rec.level === 'error' || rec.level === 'warning') && typeof rec.content === 'string') {
        items.push({ kind: 'system', id: id(), ts, text: rec.content.slice(0, 4000), level: rec.level });
      }
    }
  }
  flushTurn();
  return { items, truncated };
}
