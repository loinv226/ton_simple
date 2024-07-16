import { toNano } from '@ton/core';
import { Router } from '../wrappers/Router';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const router = provider.open(
        Router.createFromConfig(
            {
                id: Math.floor(Math.random() * 10000),
                authority: provider.sender().address!,
                creationFee: 0,
                feeReceiver: provider.sender().address!,
                nativeFeeOnlyPercent: 0,
                nativeFeePercent: 0,
                tokenFeePercent: 0,
                poolCode: await compile('Pool'),
                contributorCode: await compile('ContributorAccount'),
            },
            await compile('Router'),
        ),
    );

    await router.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(router.address);

    console.log('ID', await router.getID());
    console.log('router.address: ', router.address);
}
