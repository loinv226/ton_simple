import { toNano } from '@ton/core';
import { Master } from '../wrappers/Master';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const master = provider.open(
        Master.createFromConfig(
            {
                id: Math.floor(Math.random() * 10000),
                creationFee: 0,
                feeReceiver: provider.sender().address!,
                nativeFeeOnlyPercent: 0,
                nativeFeePercent: 0,
                poolCode: await compile('Pool'),
                tokenFeePercent: 0,
            },
            await compile('Master'),
        ),
    );

    await master.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(master.address);

    console.log('ID', await master.getID());
}
