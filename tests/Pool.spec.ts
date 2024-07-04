import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, Cell, Dictionary, beginCell, toNano } from '@ton/core';
import { Pool } from '../wrappers/Pool';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { JettonMinter } from '../wrappers/JettonMinter';
import { JettonWallet } from '../wrappers/JettonWallet';
import { ActiveJettonWallet } from '../utils/utils';
import { createJettonTransferMessage } from '../utils/jetton_utils';

describe('Pool', () => {
    let poolCode = new Cell();
    let contributorCode = new Cell();

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let pool: SandboxContract<Pool>;

    let master: SandboxContract<TreasuryContract>;
    let tokenVaultWallet: SandboxContract<TreasuryContract>;
    let currencyVaultWallet: SandboxContract<TreasuryContract>;

    beforeAll(async () => {
        poolCode = await compile('Pool');
        contributorCode = await compile('Contributor');

        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        master = await blockchain.treasury('master');
        tokenVaultWallet = await blockchain.treasury('tokenVaultWallet');
        currencyVaultWallet = await blockchain.treasury('currencyVaultWallet');

        // deploy pool
        pool = blockchain.openContract(
            Pool.createFromConfig(
                {
                    tokenVault: tokenVaultWallet.address,
                    currencyVault: currencyVaultWallet.address,
                    masterAddress: master.address,
                    contributorCode: contributorCode,
                },
                poolCode,
            ),
        );

        const deployResult = await pool.sendDeploy(deployer.getSender(), toNano('10'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: pool.address,
            deploy: true,
            success: true,
        });
    });

    beforeEach(async () => {});

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and master are ready to use
    });

    it('should init pool success', async () => {
        const initResult = await pool.sendInitPool(master.getSender(), {
            value: toNano('0.05'),
            owner: deployer.address,
            tokenAmount: toNano('100000'),
        });

        expect(initResult.transactions).toHaveTransaction({
            from: master.address,
            on: pool.address,
            success: true,
        });
    });
});
