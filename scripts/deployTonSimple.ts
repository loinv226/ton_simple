import { toNano } from '@ton/core';
import { TonSimple } from '../wrappers/TonSimple';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const tonSimple = provider.open(
        TonSimple.createFromConfig(
            {
                id: Math.floor(Math.random() * 10000),
                counter: 0,
            },
            await compile('TonSimple')
        )
    );

    await tonSimple.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(tonSimple.address);

    console.log('ID', await tonSimple.getID());
}
