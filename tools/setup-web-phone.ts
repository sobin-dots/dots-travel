import 'dotenv/config';
import * as plivo from 'plivo';

async function main() {
  const client = new (plivo as any).Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);
  const publicBaseUrl = (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').trim().replace(/\/+$/, '');
  const answerUrl = `${publicBaseUrl}/api/v1/webhooks/voice/answer`;
  const hangupUrl = `${publicBaseUrl}/api/v1/webhooks/voice/hangup`;

  console.log(`Configuring Plivo Web Phone with answerUrl: ${answerUrl}`);

  // 1. Check or create Plivo Application
  const apps = await client.applications.list();
  let app = apps.find((a: any) => a.appName === 'PilvoWebPhone');

  if (!app) {
    console.log('Creating new Plivo Application: PilvoWebPhone');
    app = await client.applications.create('PilvoWebPhone', {
      answerUrl,
      answerMethod: 'POST',
      hangupUrl,
      hangupMethod: 'POST',
      defaultEndpointApp: true,
    });
    console.log('Created App:', app);
  } else {
    console.log(`Updating existing PilvoWebPhone App (appId: ${app.appId})`);
    await client.applications.update(app.appId, {
      answerUrl,
      answerMethod: 'POST',
      hangupUrl,
      hangupMethod: 'POST',
      defaultEndpointApp: true,
    });
    console.log('Updated App answerUrl.');
  }

  // 2. Check or create Endpoint
  const endpoints = await client.endpoints.list();
  console.log(`Found ${endpoints.length} existing endpoints.`);
  let endpoint = endpoints[0];

  const username = 'pilvowebagent01';
  const password = process.env.PLIVO_ENDPOINT_PASSWORD || 'PlivoWebRTCSecret2026!';

  if (!endpoint) {
    console.log(`Creating endpoint: ${username}`);
    endpoint = await client.endpoints.create(username, password, 'PilvoWebAgent01', app.appId);
    console.log('Created endpoint:', endpoint);
  } else {
    console.log(`Updating endpoint ${endpoint.endpointId} with appId: ${app.appId}`);
    await client.endpoints.update(endpoint.endpointId, {
      appId: app.appId,
      password,
      alias: 'PilvoWebAgent01',
    });
  }

  console.log('Web phone setup complete!');
  console.log({
    appId: app.appId,
    endpointId: endpoint.endpointId,
    username: endpoint.username,
  });
}

main().catch(console.error).finally(() => process.exit(0));
