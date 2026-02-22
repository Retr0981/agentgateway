/**
 * AgentTrust — Scope Manifests Demo
 *
 * Demonstrates the new scope/purpose manifest feature:
 *
 * 1. Register a developer + agent
 * 2. Start a gateway with multiple actions
 * 3. Agent gets a SCOPED certificate (only authorized for specific actions)
 * 4. Agent successfully executes in-scope actions
 * 5. Agent is BLOCKED from out-of-scope actions
 * 6. Agent gets an UNSCOPED certificate and can do everything
 *
 * Usage:
 *   npx ts-node examples/scope-demo.ts
 */

import express from 'express';

const STATION_URL = process.env.STATION_URL || 'https://agentgateway-6f041c655eb3.herokuapp.com';
const GATEWAY_PORT = 4568;
const GATEWAY_URL = `http://localhost:${GATEWAY_PORT}/agent-gateway`;

const log = {
  step: (n: number, msg: string) => console.log(`\n${'='.repeat(60)}\n  STEP ${n}: ${msg}\n${'='.repeat(60)}`),
  info: (msg: string) => console.log(`  [i] ${msg}`),
  success: (msg: string) => console.log(`  [OK] ${msg}`),
  error: (msg: string) => console.log(`  [X] ${msg}`),
  data: (label: string, data: unknown) => console.log(`  [>] ${label}:`, JSON.stringify(data, null, 2).split('\n').join('\n     ')),
  separator: () => console.log(`  ${'_'.repeat(50)}`),
};

async function main() {
  console.log(`
+----------------------------------------------------------+
|        AgentTrust - Scope Manifests Demo                 |
|                                                          |
|  Station: ${STATION_URL.padEnd(46)}|
|  Gateway: ${GATEWAY_URL.padEnd(46)}|
+----------------------------------------------------------+
  `);

  let gatewayServer: ReturnType<typeof express.prototype.listen>;

  try {
    // ─── STEP 1: Register Developer + Agent ───
    log.step(1, 'Register Developer + Agent');

    const devEmail = `scope-demo-${Date.now()}@example.com`;
    const registerRes = await fetch(`${STATION_URL}/developers/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: devEmail, companyName: 'Scope Demo Inc.' })
    });
    const registerData = await registerRes.json() as any;
    const apiKey = registerData.data.apiKey;
    log.success(`Developer registered: ${devEmail}`);

    const agentExternalId = `scope-agent-${Date.now()}`;
    await fetch(`${STATION_URL}/developers/agents`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ externalId: agentExternalId })
    });
    log.success(`Agent registered: ${agentExternalId}`);

    // ─── STEP 2: Start Gateway with 4 Actions ───
    log.step(2, 'Start Gateway with 4 Actions (search, view, checkout, admin)');

    const app = express();
    app.use(express.json());

    const { createGateway } = await import('../packages/gateway/src/index');

    const gateway = createGateway({
      stationUrl: STATION_URL,
      gatewayId: 'scope-demo-store',
      stationApiKey: apiKey,
      actions: {
        'search': {
          description: 'Search products',
          minScore: 0,
          parameters: { query: { type: 'string', required: true } },
          handler: async (params) => ({ results: [`result for "${params.query}"`] })
        },
        'view_product': {
          description: 'View a product',
          minScore: 0,
          parameters: { id: { type: 'string', required: true } },
          handler: async (params) => ({ id: params.id, name: 'Test Product', price: 29.99 })
        },
        'checkout': {
          description: 'Purchase a product',
          minScore: 0,
          parameters: { id: { type: 'string', required: true } },
          handler: async (params) => ({ orderId: `order_${Date.now()}`, productId: params.id })
        },
        'admin_panel': {
          description: 'Access admin panel',
          minScore: 0,
          parameters: {},
          handler: async () => ({ users: 1234, revenue: '$50k' })
        }
      }
    });

    app.use('/agent-gateway', gateway.router());

    gatewayServer = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const server = app.listen(GATEWAY_PORT, () => {
        log.success(`Gateway running at http://localhost:${GATEWAY_PORT}`);
        resolve(server);
      });
    });

    // ─── STEP 3: Agent Gets SCOPED Certificate ───
    log.step(3, 'Agent Requests SCOPED Certificate (search + view_product only)');

    const { createAgentClient } = await import('../packages/agent-sdk/src/index');

    const agent = createAgentClient({
      stationUrl: STATION_URL,
      apiKey: apiKey,
      agentId: agentExternalId
    });

    // Request certificate with scope limited to search + view_product
    const scopedCert = await agent.getCertificate(false, ['search', 'view_product']);
    log.success('Got scoped certificate');
    log.info('Declared scope: ["search", "view_product"]');

    // ─── STEP 4: Execute IN-SCOPE Actions (should succeed) ───
    log.step(4, 'Execute IN-SCOPE Actions');

    const searchResult = await agent.executeAction(GATEWAY_URL, 'search', { query: 'widgets' });
    if (searchResult.success) {
      log.success('search("widgets") - ALLOWED (in scope)');
      log.data('Result', searchResult.data);
    } else {
      log.error(`search failed: ${searchResult.error}`);
    }
    log.separator();

    const viewResult = await agent.executeAction(GATEWAY_URL, 'view_product', { id: 'prod_001' });
    if (viewResult.success) {
      log.success('view_product("prod_001") - ALLOWED (in scope)');
      log.data('Result', viewResult.data);
    } else {
      log.error(`view_product failed: ${viewResult.error}`);
    }

    // ─── STEP 5: Execute OUT-OF-SCOPE Actions (should be BLOCKED) ───
    log.step(5, 'Execute OUT-OF-SCOPE Actions (should be BLOCKED)');

    const checkoutResult = await agent.executeAction(GATEWAY_URL, 'checkout', { id: 'prod_001' });
    if (!checkoutResult.success) {
      log.success('checkout("prod_001") - BLOCKED (out of scope!)');
      log.info(`Error: ${checkoutResult.error}`);
    } else {
      log.error('checkout should have been blocked but succeeded!');
    }
    log.separator();

    const adminResult = await agent.executeAction(GATEWAY_URL, 'admin_panel', {});
    if (!adminResult.success) {
      log.success('admin_panel() - BLOCKED (out of scope!)');
      log.info(`Error: ${adminResult.error}`);
    } else {
      log.error('admin_panel should have been blocked but succeeded!');
    }

    // ─── STEP 6: Agent Gets UNSCOPED Certificate (wildcard) ───
    log.step(6, 'Agent Requests UNSCOPED Certificate (wildcard access)');

    // Clear scope and get new cert
    agent.setScope(undefined);
    const unscopedCert = await agent.getCertificate(true);
    log.success('Got unscoped certificate (wildcard)');
    log.info('No scope claim - all actions allowed');

    // Now checkout should work
    const checkoutResult2 = await agent.executeAction(GATEWAY_URL, 'checkout', { id: 'prod_001' });
    if (checkoutResult2.success) {
      log.success('checkout("prod_001") - ALLOWED (no scope restriction)');
      log.data('Result', checkoutResult2.data);
    } else {
      log.error(`checkout failed: ${checkoutResult2.error}`);
    }
    log.separator();

    const adminResult2 = await agent.executeAction(GATEWAY_URL, 'admin_panel', {});
    if (adminResult2.success) {
      log.success('admin_panel() - ALLOWED (no scope restriction)');
      log.data('Result', adminResult2.data);
    } else {
      log.error(`admin_panel failed: ${adminResult2.error}`);
    }

    // ─── Summary ───
    log.step(7, 'Summary');

    console.log(`
  Scope Manifests Demo Results:

  SCOPED CERTIFICATE (scope: ["search", "view_product"])
  1. [OK] search      - ALLOWED  (in scope)
  2. [OK] view_product - ALLOWED  (in scope)
  3. [OK] checkout    - BLOCKED  (out of scope)
  4. [OK] admin_panel - BLOCKED  (out of scope)

  UNSCOPED CERTIFICATE (wildcard)
  5. [OK] checkout    - ALLOWED  (no scope restriction)
  6. [OK] admin_panel - ALLOWED  (no scope restriction)

  KEY INSIGHT: Scope manifests let agents declare their intent.
  A "product search" agent can't suddenly access checkout or admin.
  Gateways enforce scope automatically, catching misaligned behavior
  BEFORE it touches the reputation system.
    `);

    gatewayServer.close();
    gateway.destroy();
    process.exit(0);

  } catch (error) {
    log.error(`Demo failed: ${(error as Error).message}`);
    console.error(error);
    process.exit(1);
  }
}

main();
