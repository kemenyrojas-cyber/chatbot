const baseUrl = String(process.env.LEXIA_URL || 'http://localhost:3000').replace(/\/+$/, '');

async function main() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${baseUrl}/api/health`, { signal: controller.signal });
    const body = await response.json();
    if (!response.ok || !body.ok) {
      throw new Error(`Health check returned ${response.status}: ${JSON.stringify(body)}`);
    }
    console.log(`LEXIA healthy: ${body.service} (${body.environment}), uptime ${body.uptimeSeconds}s.`);
  } finally {
    clearTimeout(timeout);
  }
}

main().catch(error => {
  console.error(`LEXIA health check failed: ${error.message}`);
  process.exit(1);
});
