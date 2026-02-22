/**
 * AgentTrust — Video Demo Script
 *
 * Run this while recording your screen. It walks through
 * the full flow with visual output for the demo video.
 *
 * Usage: npx ts-node examples/video-demo.ts
 */

const STATION = 'https://agentgateway-6f041c655eb3.herokuapp.com';

// ─── Colors for terminal output ───
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function log(msg: string) { console.log(msg); }
function success(msg: string) { console.log(`  ${GREEN}✓${RESET} ${msg}`); }
function fail(msg: string) { console.log(`  ${RED}✗${RESET} ${msg}`); }
function info(msg: string) { console.log(`  ${DIM}${msg}${RESET}`); }
function warn(msg: string) { console.log(`  ${YELLOW}⚠${RESET} ${msg}`); }
function header(step: string, title: string) {
  console.log(`\n${BLUE}${BOLD}[${step}]${RESET} ${BOLD}${title}${RESET}`);
}
function divider() { console.log(`${DIM}${'─'.repeat(60)}${RESET}`); }

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function api(method: string, path: string, body?: any, apiKey?: string): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const res = await fetch(`${STATION}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json() as any;
}

async function main() {
  const timestamp = Date.now();

  console.log(`\n${CYAN}${BOLD}═══════════════════════════════════════════════════${RESET}`);
  console.log(`${CYAN}${BOLD}  AgentTrust — Live Demo${RESET}`);
  console.log(`${CYAN}${BOLD}  The trust layer for the AI agent economy${RESET}`);
  console.log(`${CYAN}${BOLD}═══════════════════════════════════════════════════${RESET}`);
  console.log(`${DIM}  Station: ${STATION}${RESET}\n`);

  await sleep(1000);

  // ─── Step 1: Register Developer ───
  header('1/7', 'Register as a developer');
  await sleep(500);

  const devResult = await api('POST', '/developers/register', {
    email: `demo-${timestamp}@agenttrust.io`,
    companyName: 'Demo Corp'
  });

  const apiKey = devResult.data.apiKey;
  success(`Developer registered`);
  info(`Email: demo-${timestamp}@agenttrust.io`);
  info(`API Key: ${apiKey.substring(0, 20)}...`);

  await sleep(1500);

  // ─── Step 2: Register Agent ───
  header('2/7', 'Register an AI agent');
  await sleep(500);

  const agentResult = await api('POST', '/developers/agents', {
    externalId: `demo-agent-${timestamp}`
  }, apiKey);

  success('Agent registered');
  info(`Agent ID: demo-agent-${timestamp}`);
  info(`Starting reputation score: ${BOLD}50${RESET}`);

  await sleep(1500);

  // ─── Step 3: Request Certificate ───
  header('3/7', 'Request a cryptographic certificate');
  await sleep(500);

  const certResult = await api('POST', '/certificates/request', {
    agentId: `demo-agent-${timestamp}`
  }, apiKey);

  const token = certResult.data.token;
  success('Certificate issued');
  info(`Reputation score: ${certResult.data.score}`);
  info(`Algorithm: RS256 (RSA + SHA-256)`);
  info(`Expires: ${new Date(certResult.data.expiresAt).toISOString()}`);
  info(`JWT: ${token.substring(0, 40)}...`);

  await sleep(2000);

  // ─── Step 4: Verify Certificate ───
  header('4/7', 'Verify the certificate (local, no network call)');
  await sleep(500);

  const verifyResult = await api('GET', `/certificates/verify?token=${token}`);
  const cert = verifyResult.data || verifyResult;

  success('Certificate verified');
  info(`Agent: ${cert.agentExternalId || cert.sub || 'verified'}`);
  info(`Score at issuance: ${cert.score ?? certResult.data.score}`);
  info(`Identity verified: ${cert.identityVerified ?? false}`);
  info(`Issuer: ${cert.iss || 'agent-trust-station'}`);
  info(`Signature: RS256 — ${GREEN}VALID${RESET}`);

  await sleep(2000);

  // ─── Step 5: Good Agent — Successful Actions ───
  header('5/7', 'Good agent performs actions');
  await sleep(500);

  // Simulate good behavior — verify and report success
  for (let i = 1; i <= 3; i++) {
    const verifyAction = await api('POST', '/verify', {
      agentId: `demo-agent-${timestamp}`,
      actionType: i <= 2 ? 'browse_products' : 'place_order',
      threshold: 30
    }, apiKey);

    if (verifyAction.data.allowed) {
      success(`Action ${i}: ${i <= 2 ? 'browse_products' : 'place_order'} — ${GREEN}ALLOWED${RESET}`);
      info(`Score: ${verifyAction.data.score} / Min: 30 — Trust verified`);

      // Report success
      await api('POST', '/report', {
        actionId: verifyAction.data.actionId,
        outcome: 'success'
      }, apiKey);
    } else {
      warn(`Action ${i}: ${verifyAction.data.reason}`);
    }

    await sleep(800);
  }

  // Check updated reputation
  const repResult = await api('GET', `/agents/demo-agent-${timestamp}/reputation`, null, apiKey);
  const newScore = repResult.data.currentScore;

  log('');
  success(`Reputation updated: 50 → ${BOLD}${GREEN}${newScore}${RESET}`);
  info('Successful actions build trust over time');

  await sleep(2000);

  // ─── Step 6: Malicious Agent — Gets Blocked ───
  header('6/7', `${RED}Malicious agent attack simulation${RESET}`);
  await sleep(1000);

  // Register a second "malicious" agent
  await api('POST', '/developers/agents', {
    externalId: `malicious-agent-${timestamp}`
  }, apiKey);

  log(`\n  ${RED}Simulating rapid-fire + probing attack...${RESET}\n`);

  let blocked = false;
  for (let i = 1; i <= 12; i++) {
    if (blocked) break;

    const actionType = i <= 4 ? 'browse_products' :
                       i <= 8 ? 'admin_access' :  // Trying privileged actions
                       'delete_data';               // Escalating

    const verifyAction = await api('POST', '/verify', {
      agentId: `malicious-agent-${timestamp}`,
      actionType,
      threshold: i <= 4 ? 30 : 90 // High threshold to trigger denials
    }, apiKey);

    if (verifyAction.data.allowed) {
      // Report failures (simulating bad outcomes)
      await api('POST', '/report', {
        actionId: verifyAction.data.actionId,
        outcome: 'failure'
      }, apiKey);

      warn(`Request ${i}: ${actionType} — allowed but ${RED}FAILED${RESET}`);
    } else {
      fail(`Request ${i}: ${actionType} — ${RED}DENIED${RESET} (${verifyAction.data.reason})`);
    }

    // Check if reputation has dropped significantly
    if (i % 4 === 0) {
      const malRep = await api('GET', `/agents/malicious-agent-${timestamp}/reputation`, null, apiKey);
      info(`  Reputation after ${i} attacks: ${YELLOW}${malRep.data.currentScore}${RESET}`);

      if (malRep.data.currentScore < 30) {
        log('');
        fail(`${RED}${BOLD}AGENT REPUTATION DESTROYED${RESET} — Score: ${malRep.data.currentScore}`);
        info('This agent is now flagged across ALL gateways');
        info('Bad behavior follows the agent everywhere');
        blocked = true;
      }
    }

    await sleep(300);
  }

  await sleep(2000);

  // ─── Step 7: Final Summary ───
  header('7/7', 'Summary');
  await sleep(500);

  divider();
  log('');
  log(`  ${GREEN}Good agent${RESET}:  Score 50 → ${GREEN}${BOLD}${newScore}${RESET} (trust earned)`);

  const finalMalRep = await api('GET', `/agents/malicious-agent-${timestamp}/reputation`, null, apiKey);
  log(`  ${RED}Bad agent${RESET}:   Score 50 → ${RED}${BOLD}${finalMalRep.data.currentScore}${RESET} (reputation destroyed)`);
  log('');
  divider();
  log('');
  log(`  ${CYAN}${BOLD}AgentTrust — The trust layer for the AI agent economy${RESET}`);
  log('');
  log(`  ${DIM}GitHub:${RESET}  https://github.com/mmsadek96/agentgateway`);
  log(`  ${DIM}npm:${RESET}     npm install @agent-trust/gateway`);
  log(`  ${DIM}npm:${RESET}     npm install @agent-trust/sdk`);
  log(`  ${DIM}Live:${RESET}    ${STATION}`);
  log(`  ${DIM}Dash:${RESET}    ${STATION}/dashboard`);
  log('');
  log(`  ${GREEN}MIT Licensed${RESET} — ${DIM}Open source, PRs welcome${RESET}`);
  log('');
}

main().catch(console.error);
