import { ApiPromise, WsProvider } from '@pezkuwi/api';

const ADDRESS = '5CyuFfbF95rzBxru7c9yEsX4XmQXUxpLUcbj9RLg9K1cGiiF';

async function checkChain(name, endpoint) {
  console.log(`\n========== ${name} ==========`);
  console.log(`Connecting to ${endpoint}...`);

  try {
    const provider = new WsProvider(endpoint);
    const api = await ApiPromise.create({ provider });
    await api.isReady;
    console.log('Connected!\n');

    // List all available pallets
    console.log('Available Pallets:');
    const pallets = Object.keys(api.query);
    console.log(pallets.join(', '));
    console.log('');

    // Check specific pallets
    const checkPallets = ['trust', 'referral', 'stakingScore', 'tiki', 'assetRewards', 'staking'];

    for (const pallet of checkPallets) {
      if (api.query[pallet]) {
        console.log(`✓ ${pallet} pallet exists`);
        console.log(`  Storage: ${Object.keys(api.query[pallet]).join(', ')}`);

        // Try to query user data
        if (pallet === 'trust' && api.query.trust.trustScores) {
          const score = await api.query.trust.trustScores(ADDRESS);
          console.log(`  Your trust score: ${score.toString()}`);
        }
        if (pallet === 'referral' && api.query.referral.referralCount) {
          const count = await api.query.referral.referralCount(ADDRESS);
          console.log(`  Your referral count: ${count.toString()}`);
        }
        if (pallet === 'stakingScore') {
          for (const storage of Object.keys(api.query.stakingScore)) {
            try {
              const val = await api.query.stakingScore[storage](ADDRESS);
              console.log(`  ${storage}: ${val.toString()}`);
            } catch {
              console.log(`  ${storage}: (requires different args)`);
            }
          }
        }
        if (pallet === 'staking' && api.query.staking.ledger) {
          const ledger = await api.query.staking.ledger(ADDRESS);
          console.log(`  Your staking ledger: ${ledger.toString()}`);
        }
      } else {
        console.log(`✗ ${pallet} pallet NOT available`);
      }
    }

    await api.disconnect();
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }
}

async function main() {
  await checkChain('Relay Chain', 'wss://rpc.pezkuwichain.io');
  await checkChain('People Chain', 'wss://people-rpc.pezkuwichain.io');
  await checkChain('Asset Hub', 'wss://asset-hub-rpc.pezkuwichain.io');
  process.exit(0);
}

main().catch(console.error);
