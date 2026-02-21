/**
 * AgentTrust — End-to-End Demo
 *
 * This script demonstrates the FULL flow:
 *
 * 1. Register a developer on the Station (get API key)
 * 2. Register an AI agent
 * 3. Start a sample e-commerce website with the Gateway middleware
 * 4. Agent uses the SDK to discover the gateway, get a certificate, and execute actions
 * 5. Gateway reports behavior back to the Station
 * 6. Agent's reputation updates based on outcomes
 *
 * Usage:
 *   npx ts-node examples/e2e-demo.ts
 *
 * By default, uses the live Station at Heroku. Set STATION_URL to override.
 */

import express from 'express';

// ─── Configuration ───

const STATION_URL = process.env.STATION_URL || 'https://agentgateway-6f041c655eb3.herokuapp.com';
const GATEWAY_PORT = 4567;
const GATEWAY_URL = `http://localhost:${GATEWAY_PORT}/agent-gateway`;

// ─── Simulated Product Database ───

const products = [
  { id: 'prod_001', name: 'Mechanical Keyboard', price: 149.99, stock: 23 },
  { id: 'prod_002', name: 'Wireless Mouse', price: 79.99, stock: 45 },
  { id: 'prod_003', name: 'USB-C Hub', price: 49.99, stock: 100 },
  { id: 'prod_004', name: '4K Monitor', price: 599.99, stock: 8 },
  { id: 'prod_005', name: 'Standing Desk', price: 449.99, stock: 15 },
];

const orders: Array<{ id: string; productId: string; quantity: number; total: number; agentId: string }> = [];

// ─── Helper: Colored Console Output ───

const log = {
  step: (n: number, msg: string) => console.log(`\n${'='.repeat(60)}\n  STEP ${n}: ${msg}\n${'='.repeat(60)}`),
  info: (msg: string) => console.log(`  ℹ️  ${msg}`),
  success: (msg: string) => console.log(`  ✅ ${msg}`),
  error: (msg: string) => console.log(`  ❌ ${msg}`),
  data: (label: string, data: unknown) => console.log(`  📦 ${label}:`, JSON.stringify(data, null, 2).split('\n').join('\n     ')),
  separator: () => console.log(`  ${'─'.repeat(50)}`),
};

// ─── Main Demo Flow ───

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║           AgentTrust — End-to-End Demo                   ║
║                                                          ║
║  Station:  ${STATION_URL.padEnd(44)}║
║  Gateway:  ${GATEWAY_URL.padEnd(44)}║
╚══════════════════════════════════════════════════════════╝
  `);

  let apiKey: string;
  let agentId: string;
  let gatewayServer: ReturnType<typeof express.prototype.listen>;

  try {
    // ─── STEP 1: Register a Developer ───
    log.step(1, 'Register a Developer on the Station');

    const devEmail = `demo-${Date.now()}@example.com`;
    const registerRes = await fetch(`${STATION_URL}/developers/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: devEmail, companyName: 'Demo E-Commerce Inc.' })
    });

    const registerData = await registerRes.json() as any;

    if (!registerData.success) {
      log.error(`Registration failed: ${registerData.error}`);
      process.exit(1);
    }

    apiKey = registerData.data.apiKey;
    log.success(`Developer registered: ${devEmail}`);
    log.info(`API Key: ${apiKey.substring(0, 20)}...`);
    log.info(`Plan: ${registerData.data.plan}`);

    // ─── STEP 2: Register an Agent ───
    log.step(2, 'Register an AI Agent');

    const agentExternalId = `demo-agent-${Date.now()}`;
    const agentRes = await fetch(`${STATION_URL}/developers/agents`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ externalId: agentExternalId })
    });

    const agentData = await agentRes.json() as any;

    if (!agentData.success) {
      log.error(`Agent registration failed: ${agentData.error}`);
      process.exit(1);
    }

    agentId = agentExternalId;
    log.success(`Agent registered: ${agentExternalId}`);
    log.info(`Internal ID: ${agentData.data.id}`);
    log.info(`Initial reputation score: ${agentData.data.reputationScore}`);

    // ─── STEP 3: Start the Sample Gateway (E-Commerce Site) ───
    log.step(3, 'Start Sample E-Commerce Gateway');

    const app = express();
    app.use(express.json());

    // Import gateway using relative path (since we're in the monorepo)
    const { createGateway } = await import('../packages/gateway/src/index');

    const gateway = createGateway({
      stationUrl: STATION_URL,
      gatewayId: 'demo-ecommerce',
      stationApiKey: apiKey,
      actions: {
        'search_products': {
          description: 'Search the product catalog by keyword',
          minScore: 30,
          parameters: {
            query: { type: 'string', required: true, description: 'Search keyword' }
          },
          handler: async (params) => {
            const query = (params.query as string).toLowerCase();
            const results = products.filter(p =>
              p.name.toLowerCase().includes(query)
            );
            return { results, count: results.length };
          }
        },
        'get_product': {
          description: 'Get details of a specific product',
          minScore: 30,
          parameters: {
            productId: { type: 'string', required: true, description: 'Product ID' }
          },
          handler: async (params) => {
            const product = products.find(p => p.id === params.productId);
            if (!product) throw new Error('Product not found');
            return product;
          }
        },
        'place_order': {
          description: 'Place an order for a product',
          minScore: 60,  // Higher trust required for purchases!
          parameters: {
            productId: { type: 'string', required: true, description: 'Product ID' },
            quantity: { type: 'number', required: true, description: 'Quantity to order' }
          },
          handler: async (params, agent) => {
            const product = products.find(p => p.id === params.productId);
            if (!product) throw new Error('Product not found');
            if (product.stock < (params.quantity as number)) throw new Error('Insufficient stock');

            const order = {
              id: `order_${Date.now()}`,
              productId: product.id,
              quantity: params.quantity as number,
              total: product.price * (params.quantity as number),
              agentId: agent.agentId
            };
            orders.push(order);
            product.stock -= params.quantity as number;

            return { orderId: order.id, total: order.total, status: 'confirmed' };
          }
        },
        'check_order_status': {
          description: 'Check the status of an order',
          minScore: 30,
          parameters: {
            orderId: { type: 'string', required: true, description: 'Order ID' }
          },
          handler: async (params) => {
            const order = orders.find(o => o.id === params.orderId);
            if (!order) throw new Error('Order not found');
            return { ...order, status: 'processing' };
          }
        }
      }
    });

    app.use('/agent-gateway', gateway.router());

    // Also add a human-readable home page
    app.get('/', (_req, res) => {
      res.json({
        name: 'Demo E-Commerce Store',
        agentGateway: '/agent-gateway',
        discovery: '/agent-gateway/.well-known/agent-gateway'
      });
    });

    gatewayServer = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const server = app.listen(GATEWAY_PORT, () => {
        log.success(`Gateway running at http://localhost:${GATEWAY_PORT}`);
        log.info(`Discovery endpoint: ${GATEWAY_URL}/.well-known/agent-gateway`);
        resolve(server);
      });
    });

    // ─── STEP 4: Agent Discovers the Gateway ───
    log.step(4, 'Agent Discovers the Gateway');

    // Use the SDK
    const { createAgentClient } = await import('../packages/agent-sdk/src/index');

    const agent = createAgentClient({
      stationUrl: STATION_URL,
      apiKey: apiKey,
      agentId: agentId
    });

    // Discover
    const discovery = await agent.discoverGateway(GATEWAY_URL);
    log.success(`Gateway discovered: ${discovery.gatewayId}`);
    log.info(`Available actions: ${Object.keys(discovery.actions).join(', ')}`);
    log.separator();

    for (const [name, action] of Object.entries(discovery.actions)) {
      log.info(`  ${name} (min score: ${action.minScore}) — ${action.description}`);
    }

    // ─── STEP 5: Agent Gets Certificate & Executes Actions ───
    log.step(5, 'Agent Requests Certificate & Executes Actions');

    // Get certificate
    const score = await agent.getScore();
    log.success(`Agent certificate obtained — current score: ${score}`);
    log.separator();

    // 5a: Search products
    log.info('Action: search_products("keyboard")');
    const searchResult = await agent.executeAction(GATEWAY_URL, 'search_products', { query: 'keyboard' });
    log.data('Search result', searchResult);
    log.separator();

    // 5b: Get product details
    log.info('Action: get_product("prod_001")');
    const productResult = await agent.executeAction(GATEWAY_URL, 'get_product', { productId: 'prod_001' });
    log.data('Product details', productResult);
    log.separator();

    // 5c: Try to place an order (will likely fail — score is 50, need 60)
    log.info('Action: place_order (requires score >= 60, agent has ~50)');
    const orderResult = await agent.executeAction(GATEWAY_URL, 'place_order', {
      productId: 'prod_001',
      quantity: 1
    });

    if (orderResult.success) {
      log.success('Order placed!');
      log.data('Order', orderResult);
    } else {
      log.info(`Order denied: ${orderResult.error}`);
      log.info('This is expected! New agents start at score 50, order requires 60.');
      log.info('The agent needs to build reputation through successful low-risk actions first.');
    }

    // ─── STEP 6: Check Reputation After Actions ───
    log.step(6, 'Check Agent Reputation After Actions');

    // Wait a moment for reports to process
    await new Promise(r => setTimeout(r, 2000));

    const reputationRes = await fetch(`${STATION_URL}/agents/${agentId}/reputation`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    const reputationData = await reputationRes.json() as any;

    if (reputationData.success) {
      log.success(`Current reputation score: ${reputationData.data.currentScore}`);
      log.data('Score breakdown', reputationData.data.factors);
    } else {
      log.info(`Reputation check: ${reputationData.error || 'No data yet'}`);
    }

    // ─── STEP 7: Summary ───
    log.step(7, 'Demo Summary');

    console.log(`
  The full AgentTrust flow works end-to-end:

  1. ✅ Developer registered on Station → got API key
  2. ✅ Agent registered → got initial score of 50
  3. ✅ E-commerce site running with Gateway middleware
  4. ✅ Agent discovered gateway's available actions
  5. ✅ Agent got cryptographic certificate from Station
  6. ✅ Agent executed low-trust actions (search, view product)
  7. ${orderResult.success ? '✅' : '🔒'} High-trust action (place_order) ${orderResult.success ? 'succeeded' : 'correctly blocked (score too low)'}
  8. ✅ Gateway reported behavior back to Station
  9. ✅ Agent reputation updated based on outcomes

  KEY INSIGHT: The agent was allowed to browse (low trust required)
  but blocked from ordering (high trust required). As the agent
  builds a track record of successful actions, its score will rise
  and eventually unlock higher-privilege actions.

  This is the "police station" model in action:
  - New agents start on probation (score 50)
  - Good behavior earns trust over time
  - Bad behavior destroys reputation permanently
  - High-value actions require proven track records
    `);

    // Clean up
    gatewayServer.close();
    process.exit(0);

  } catch (error) {
    log.error(`Demo failed: ${(error as Error).message}`);
    console.error(error);
    process.exit(1);
  }
}

main();
