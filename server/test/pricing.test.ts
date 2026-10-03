import assert from 'node:assert/strict';
import { test } from 'node:test';
import { costOf, lookupPricing, tokensFromUsage } from '../../shared/pricing.ts';

test('dated snapshot ids resolve to their base model', () => {
  assert.deepEqual(lookupPricing('claude-haiku-4-5-20251001', '2026-10-01'), lookupPricing('claude-haiku-4-5', '2026-10-01'));
});

test('newer point releases fall back to the family prefix', () => {
  assert.equal(lookupPricing('claude-opus-5-5', '2026-10-01')?.output, 25);
});

test('sonnet 5 switches from intro to standard pricing after 2026-08-31', () => {
  assert.equal(lookupPricing('claude-sonnet-5', '2026-08-31')?.input, 2);
  assert.equal(lookupPricing('claude-sonnet-5', '2026-09-01')?.input, 3);
});

test('fast mode uses premium rates only where defined', () => {
  assert.equal(lookupPricing('claude-opus-4-8', '2026-10-01', 'fast')?.input, 10);
  assert.equal(lookupPricing('claude-haiku-4-5', '2026-10-01', 'fast')?.input, 1);
});

test('unknown models are unpriced', () => {
  assert.equal(lookupPricing('gpt-4', '2026-10-01'), null);
});

test('cost uses the 5m/1h cache-write breakdown when present', () => {
  const t = tokensFromUsage({
    input_tokens: 1_000_000,
    output_tokens: 1_000_000,
    cache_read_input_tokens: 1_000_000,
    cache_creation_input_tokens: 2_000_000,
    cache_creation: { ephemeral_5m_input_tokens: 1_000_000, ephemeral_1h_input_tokens: 1_000_000 },
  });
  // opus-5: 5 + 25 + 0.5 + 6.25 + 10
  assert.equal(costOf(t, lookupPricing('claude-opus-5', '2026-10-01')), 46.75);
});

test('without a breakdown, cache writes are treated as 5-minute writes', () => {
  const t = tokensFromUsage({ cache_creation_input_tokens: 1_000_000 });
  assert.equal(t.write5m, 1_000_000);
  assert.equal(t.write1h, 0);
});

test('cost split by kind sums to the total cost', async () => {
  const { costParts } = await import('../../shared/pricing.ts');
  const t = tokensFromUsage({
    input_tokens: 1234,
    output_tokens: 5678,
    cache_read_input_tokens: 910_111,
    cache_creation: { ephemeral_5m_input_tokens: 2_000, ephemeral_1h_input_tokens: 30_000 },
  });
  const rates = lookupPricing('claude-opus-5', '2026-10-01');
  const parts = costParts(t, rates);
  assert.ok(Math.abs(parts.input + parts.write + parts.read + parts.output - costOf(t, rates)) < 1e-12);
  assert.deepEqual(costParts(t, null), { input: 0, write: 0, read: 0, output: 0 });
});
