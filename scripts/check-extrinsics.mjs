import { ApiPromise, WsProvider } from '@pezkuwi/api';

async function main() {
  console.log('Connecting to People Chain...');
  const api = await ApiPromise.create({
    provider: new WsProvider('wss://people-rpc.pezkuwichain.io')
  });
  await api.isReady;
  console.log('Connected!\n');

  const pallets = ['trust', 'referral', 'stakingScore', 'tiki'];

  for (const pallet of pallets) {
    console.log(`========== ${pallet} ==========`);

    if (api.tx[pallet]) {
      console.log('Extrinsics (tx):');
      const txMethods = Object.keys(api.tx[pallet]);
      for (const method of txMethods) {
        const fn = api.tx[pallet][method];
        console.log(`  - ${pallet}.${method}`);
        // Try to get method info
        if (fn.meta) {
          const args = fn.meta.args.map(a => `${a.name}: ${a.type}`).join(', ');
          console.log(`    Args: (${args})`);
          if (fn.meta.docs.length > 0) {
            console.log(`    Docs: ${fn.meta.docs[0].toString().substring(0, 100)}...`);
          }
        }
      }
    } else {
      console.log('No extrinsics available');
    }

    if (api.query[pallet]) {
      console.log('\nStorage:');
      const storageMethods = Object.keys(api.query[pallet]);
      console.log(`  ${storageMethods.join(', ')}`);
    }
    console.log('');
  }

  await api.disconnect();
  process.exit(0);
}

main().catch(console.error);
