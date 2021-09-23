const { Handler } = require('secret-agent');


(async () => {
  const handler = new Handler();

  const agent = handler.createAgent();
  await agent.goto('https://ulixee.org');

  async function getDatasetCost(agent: Agent) {
    const dataset = agent.input;
    await agent.goto(`https://ulixee.org${dataset.href}`);
    const cost = agent.document.querySelector('.cost .large-text');
    agent.output.cost = await cost.textContent;
  }

  const links = await agent.document.querySelectorAll('a.DatasetSummary');
  for (const link of links) {
    const name = await link.querySelector('.title').textContent;
    const href = await link.getAttribute('href');
    handler.dispatchAgent(getDatasetCost, {
      name,
      input: {
        name,
        href,
      },
    });
  }

  const results = await handler.waitForAllDispatches(); 
  for (const result of results) {
    const cost = result.output.cost;
    const name = result.input.name;
    console.log('Cost of %s is %s', name, cost);
  }
  await handler.close();
})();

/**
 * 
(async () => {
  const remote = new RemoteConnectionToCore({
    host: '10.10.1.1:1588',
  });
  await remote.connect();

  const handler = new Handler(remote1, {
    host: '172.234.22.2:1586',
    maxConcurrency: 5,
  });

  const agent = await handler.createAgent();
})();
 */



(async () => {
  await agent.goto('https://example.org');
  const title = await agent.document.title;
  const intro = await agent.document.querySelector('p').textContent;
  agent.output = { title, intro };
  await agent.close();

  console.log('Retrieved from https://example.org', agent.output);
})();