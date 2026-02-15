import { getUncachableStripeClient } from './stripeClient';

async function seedProducts() {
  const stripe = await getUncachableStripeClient();

  const existing = await stripe.products.list({ active: true, limit: 100 });
  const existingNames = existing.data.map((p) => p.name);

  if (!existingNames.includes('Analyst')) {
    console.log('Creating Analyst plan...');
    const analyst = await stripe.products.create({
      name: 'Analyst',
      description: 'Core fraud detection tools with state-level filtering, provider explorer, and basic anomaly scanning.',
      metadata: {
        tier: 'analyst',
        features: 'dashboard,explorer,basic_scanner',
      },
    });

    await stripe.prices.create({
      product: analyst.id,
      unit_amount: 2900,
      currency: 'usd',
      recurring: { interval: 'month' },
    });

    console.log(`Created Analyst plan: ${analyst.id}`);
  } else {
    console.log('Analyst plan already exists, skipping.');
  }

  if (!existingNames.includes('Investigator')) {
    console.log('Creating Investigator plan...');
    const investigator = await stripe.products.create({
      name: 'Investigator',
      description: 'Full-suite fraud investigation with advanced scanning, severity analysis, priority alerts, and export capabilities.',
      metadata: {
        tier: 'investigator',
        features: 'dashboard,explorer,advanced_scanner,exports,priority_alerts',
      },
    });

    await stripe.prices.create({
      product: investigator.id,
      unit_amount: 7900,
      currency: 'usd',
      recurring: { interval: 'month' },
    });

    console.log(`Created Investigator plan: ${investigator.id}`);
  } else {
    console.log('Investigator plan already exists, skipping.');
  }

  console.log('Seed complete.');
}

seedProducts().catch(console.error);
