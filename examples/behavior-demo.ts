/**
 * AgentTrust — Behavioral Tracking Demo
 *
 * Demonstrates the real-time behavioral tracking system:
 *
 * Scenario 1: Good agent — browses normally, behavior score stays high
 * Scenario 2: Malicious agent — rapid-fire requests, scope violations, gets BLOCKED mid-session
 *
 * Usage:
 *   npx ts-node examples/behavior-demo.ts
 */

import express from 'express';

// ─── Configuration ───

const STATION_URL = process.env.STATION_URL || 'https://agentgateway-6f041c655eb3.herokuapp.com';
const GATEWAY_PORT = 4568;
const GATEWAY_URL = `http://localhost:${GATEWAY_PORT}/agent-gateway`;

// ─── Simulated Database ───

const products = [
  { id: 'prod_001', name: 'Mechanical Keyboard', price: 149.99, stock: 23 },
  { id: 'prod_002', name: 'Wireless Mouse', price: 79.99, stock: 45 },
  { id: 'prod_003', name: 'USB-C Hub', price: 49.99, stock: 100 },
];

// ─── Logging ───

const log = {
  step: (n: number, msg: string) => console.log(`\n${'='.repeat(60)}\n  STEP ${n}: ${msg}\n${'='.repeat(60)}`),
  info: (msg: string) => console.log(`  ℹ️  ${msg}`),
  success: (msg: string) => console.log(`  ✅ ${msg}`),
  warn: (msg: string) => console.log(`  ⚠️  ${msg}`),
  error: (msg: string) => console.log(`  ❌ ${msg}`),
  blocked: (msg: string) => console.log(`  🚫 ${msg}`),
  data: (label: string, data: unknown) => console.log(`  📦 ${label}:`, JSON.stringify(data, null, 2).split('\n').join('\n     ')),
};

// ─── Helper: Execute action and show behavior data ───

async function agentAction(
  agent: any,
  gatewayUrl: string,
  actionName: string,
  params: Record<string, unknown>,
  label: string
): Promise<any> {
  const result = await agent.executeAction(gatewayUrl, actionName, params);

  if (result.behavior) {
    const scoreBar = '█'.repeat(Math.floor(result.behavior.score / 5)) + '░'.repeat(20 - Math.floor(result.behavior.score / 5));
    log.info(`${label}`);
    log.info(`  Result: ${result.success ? '✅ success' : '❌ ' + result.error}`);
    log.info(`  Behavior: [${scoreBar}] ${result.behavior.score}/100`);
    if (result.behavior.flags?.length > 0) {
      log.warn(`  Flags: ${result.behavior.flags.join(', ')}`);
    }
    if (result.behavior.warning) {
      log.warn(`  Warning: ${result.behavior.warning}`);
    }
  } else if (result.error?.includes('blocked')) {
    log.blocked(`${label} → BLOCKED: ${result.error}`);
    if (result.flags) {
      log.warn(`  Flags: ${result.flags.join(', ')}`);
    }
  } else {
    log.info(`${label} → ${result.success ? '✅ success' : '❌ ' + result.error}`);
  }

  return result;
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Main ───

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║       AgentTrust — Behavioral Tracking Demo              ║
║                                                          ║
║  Watch how the gateway detects and blocks                ║
║  suspicious agent behavior in real-time.                 ║
╚══════════════════════════════════════════════════════════╝
  `);

  let gatewayServer: any;

  try {
    // ─── STEP 1: Setup ───
    log.step(1, 'Register Developer + 2 Agents');

    // Register developer
    const devEmail = `behavior-demo-${Date.now()}@example.com`;
    const registerRes = await fetch(`${STATION_URL}/developers/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: devEmail, companyName: 'Behavior Demo Inc.' })
    });
    const registerData = await registerRes.json() as any;
    const apiKey = registerData.data.apiKey;
    log.success(`Developer registered`);

    // Register good agent
    const goodAgentId = `good-agent-${Date.now()}`;
    await fetch(`${STATION_URL}/developers/agents`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ externalId: goodAgentId })
    });
    log.success(`Good agent registered: ${goodAgentId}`);

    // Register malicious agent
    const badAgentId = `bad-agent-${Date.now()}`;
    await fetch(`${STATION_URL}/developers/agents`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ externalId: badAgentId })
    });
    log.success(`Malicious agent registered: ${badAgentId}`);

    // ─── STEP 2: Start Gateway with Behavioral Tracking ───
    log.step(2, 'Start Gateway with Behavioral Tracking');

    const app = express();
    app.use(express.json());

    const { createGateway } = await import('../packages/gateway/src/index');

    const gateway = createGateway({
      stationUrl: STATION_URL,
      gatewayId: 'behavior-demo-store',
      stationApiKey: apiKey,
      actions: {
        'search_products': {
          description: 'Search products',
          minScore: 30,
          parameters: { query: { type: 'string', required: true } },
          handler: async (params) => {
            const query = (params.query as string).toLowerCase();
            return products.filter(p => p.name.toLowerCase().includes(query));
          }
        },
        'get_product': {
          description: 'Get product details',
          minScore: 30,
          parameters: { productId: { type: 'string', required: true } },
          handler: async (params) => {
            const product = products.find(p => p.id === params.productId);
            if (!product) throw new Error('Product not found');
            return product;
          }
        },
        'place_order': {
          description: 'Place an order',
          minScore: 60,
          parameters: {
            productId: { type: 'string', required: true },
            quantity: { type: 'number', required: true }
          },
          handler: async (params) => {
            return { orderId: `order_${Date.now()}`, status: 'confirmed' };
          }
        }
      },
      // ─── Behavioral tracking config ───
      behavior: {
        enabled: true,
        maxActionsPerMinute: 8,        // Low threshold for demo
        maxFailuresBeforeFlag: 3,       // Flag after 3 failures
        maxRepeatedActionsPerMinute: 4, // Flag after 4 identical actions
        violationPenalty: 20,           // -20 per violation for demo
        blockThreshold: 20,            // Block at 20
        onSuspiciousActivity: (event) => {
          log.warn(`🔴 ALERT: ${event.flag} — ${event.description}`);
          log.warn(`   Agent: ${event.externalId} | Behavior Score: ${event.behaviorScore}`);
        }
      }
    });

    app.use('/agent-gateway', gateway.router());

    gatewayServer = await new Promise<any>((resolve) => {
      const server = app.listen(GATEWAY_PORT, () => {
        log.success(`Gateway running on port ${GATEWAY_PORT} with behavioral tracking`);
        resolve(server);
      });
    });

    // ─── STEP 3: Good Agent — Normal Behavior ───
    log.step(3, 'Good Agent — Normal Browsing Behavior');
    log.info('The good agent browses naturally: search → view product → search again');

    const { createAgentClient } = await import('../packages/agent-sdk/src/index');

    const goodAgent = createAgentClient({
      stationUrl: STATION_URL,
      apiKey: apiKey,
      agentId: goodAgentId
    });

    await agentAction(goodAgent, GATEWAY_URL, 'search_products', { query: 'keyboard' }, 'Search for "keyboard"');
    await sleep(500);
    await agentAction(goodAgent, GATEWAY_URL, 'get_product', { productId: 'prod_001' }, 'View keyboard details');
    await sleep(800);
    await agentAction(goodAgent, GATEWAY_URL, 'search_products', { query: 'mouse' }, 'Search for "mouse"');

    log.success('Good agent completed normally — no behavioral flags!');

    // ─── STEP 4: Malicious Agent — Suspicious Behavior ───
    log.step(4, 'Malicious Agent — Suspicious Behavior');
    log.info('The malicious agent will:');
    log.info('  1. Spam the same search repeatedly (automation detection)');
    log.info('  2. Try to place orders above their trust level (scope violation)');
    log.info('  3. Rapid-fire requests (rate abuse)');
    log.info('');
    log.info('Watch the behavioral score drop and eventually trigger a BLOCK...');
    log.info('');

    const badAgent = createAgentClient({
      stationUrl: STATION_URL,
      apiKey: apiKey,
      agentId: badAgentId
    });

    // Phase 1: Spam identical searches
    log.info('── Phase 1: Repeated identical actions ──');
    for (let i = 0; i < 5; i++) {
      await agentAction(badAgent, GATEWAY_URL, 'search_products', { query: 'keyboard' }, `Spam search #${i + 1} (identical)`);
    }

    // Phase 2: Try scope violations
    log.info('');
    log.info('── Phase 2: Scope violations (score 50, needs 60) ──');
    for (let i = 0; i < 3; i++) {
      await agentAction(badAgent, GATEWAY_URL, 'place_order', { productId: 'prod_001', quantity: 1 }, `Order attempt #${i + 1} (above trust level)`);
    }

    // Phase 3: Rapid fire (should trigger block)
    log.info('');
    log.info('── Phase 3: Rapid-fire burst ──');
    for (let i = 0; i < 5; i++) {
      const result = await agentAction(badAgent, GATEWAY_URL, 'search_products', { query: `probe-${i}` }, `Rapid request #${i + 1}`);
      if (result.error?.includes('blocked')) {
        log.blocked(`Agent BLOCKED after ${i + 1} rapid requests!`);
        break;
      }
    }

    // ─── STEP 5: Verify Block Persists ───
    log.step(5, 'Verify Block Persists');

    const blockedResult = await agentAction(badAgent, GATEWAY_URL, 'search_products', { query: 'test' }, 'Blocked agent tries one more action');

    // ─── STEP 6: Check Monitoring Endpoint ───
    log.step(6, 'Gateway Monitoring Dashboard');

    const sessionsRes = await fetch(`${GATEWAY_URL}/behavior/sessions`);
    const sessionsData = await sessionsRes.json() as any;
    log.data('Active agent sessions', sessionsData);

    // ─── Summary ───
    log.step(7, 'Summary');

    console.log(`
  Behavioral Tracking Demo Results:

  GOOD AGENT:
  ✅ Browsed naturally (search → view → search)
  ✅ No behavioral flags triggered
  ✅ Behavior score remained high

  MALICIOUS AGENT:
  ⚠️  Repeated identical searches → flagged as automation
  ⚠️  Tried actions above trust level → flagged as scope violation
  ⚠️  Rapid-fire requests → flagged as rate abuse
  🚫 BLOCKED mid-session when behavior score dropped below threshold
  🚫 Block persists — all subsequent requests rejected

  KEY INSIGHT: The gateway didn't just check the agent's reputation
  once at the door. It watched what the agent DID and blocked it
  when behavior became suspicious. This is like a security camera
  system, not just an ID check at the entrance.

  The behavioral data is also reported back to the Station, so the
  agent's PERMANENT reputation is affected too — bad behavior here
  follows them to every other gateway.
    `);

    // Clean up
    gateway.destroy();
    gatewayServer.close();
    process.exit(0);

  } catch (error) {
    log.error(`Demo failed: ${(error as Error).message}`);
    console.error(error);
    if (gatewayServer) gatewayServer.close();
    process.exit(1);
  }
}

main();
