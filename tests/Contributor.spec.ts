import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { ContributorAccount } from '../wrappers/ContributorAccount';

describe('ContributorAccount', () => {
    let poolCode = new Cell();
    let contributorCode = new Cell();

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let notDeployer: SandboxContract<TreasuryContract>;
    let contributorAccount: SandboxContract<ContributorAccount>;

    beforeAll(async () => {
        poolCode = await compile('Pool');
        contributorCode = await compile('ContributorAccount');

        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        notDeployer = await blockchain.treasury('notdeployer');

        // deploy pool
        contributorAccount = blockchain.openContract(
            ContributorAccount.createFromConfig(
                {
                    owner: deployer.address,
                    pool: notDeployer.address,
                },
                contributorCode,
            ),
        );

        const deployResult = await contributorAccount.sendDeploy(deployer.getSender(), toNano('10'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: contributorAccount.address,
            deploy: true,
            success: true,
        });
    });

    beforeEach(async () => {});

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and master are ready to use
    });

    it('should contribute success', async () => {
        const txResult = await contributorAccount.sendContribute(deployer.getSender(), {
            value: toNano('0.05'),
            owner: deployer.address,
            contributeAmount: toNano('100000'),
            purchaseAmount: toNano('100000'),
        });

        expect(txResult.transactions).toHaveTransaction({
            from: deployer.address,
            on: contributorAccount.address,
            success: true,
        });
    });
});
