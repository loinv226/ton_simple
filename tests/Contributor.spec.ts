import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { Contributor } from '../wrappers/Contributor';

describe('Contributor', () => {
    let poolCode = new Cell();
    let contributorCode = new Cell();

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let notDeployer: SandboxContract<TreasuryContract>;
    let contributor: SandboxContract<Contributor>;

    beforeAll(async () => {
        poolCode = await compile('Pool');
        contributorCode = await compile('Contributor');

        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        notDeployer = await blockchain.treasury('notdeployer');

        // deploy pool
        contributor = blockchain.openContract(
            Contributor.createFromConfig(
                {
                    owner: deployer.address,
                    pool: notDeployer.address,
                },
                contributorCode,
            ),
        );

        const deployResult = await contributor.sendDeploy(deployer.getSender(), toNano('10'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: contributor.address,
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
        const txResult = await contributor.sendContribute(deployer.getSender(), {
            value: toNano('0.05'),
            owner: deployer.address,
            contributeAmount: toNano('100000'),
            purchaseAmount: toNano('100000'),
        });

        expect(txResult.transactions).toHaveTransaction({
            from: deployer.address,
            on: contributor.address,
            success: true,
        });
    });
});
