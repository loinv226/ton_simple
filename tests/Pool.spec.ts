import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, Cell, Dictionary, beginCell, toNano } from '@ton/core';
import { generateTierDictionary, Pool, WhitelistTier } from '../wrappers/Pool';
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

    let owner: SandboxContract<TreasuryContract>;
    let contributor: SandboxContract<TreasuryContract>;

    let tokenVaultWallet: SandboxContract<TreasuryContract>;
    let currencyVaultWallet: SandboxContract<TreasuryContract>;

    beforeAll(async () => {
        poolCode = await compile('Pool');
        contributorCode = await compile('ContributorAccount');

        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        owner = await blockchain.treasury('owner');
        contributor = await blockchain.treasury('contributor');

        tokenVaultWallet = await blockchain.treasury('tokenVaultWallet');
        currencyVaultWallet = await blockchain.treasury('currencyVaultWallet');

        // deploy pool
        pool = blockchain.openContract(
            Pool.createFromConfig(
                {
                    tokenVault: tokenVaultWallet.address,
                    currencyVault: currencyVaultWallet.address,
                    masterAddress: owner.address,
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
        const initResult = await pool.sendInitPool(owner.getSender(), {
            value: toNano('0.05'),
            owner: owner.address,
            tokenAmount: toNano('100000'),
        });

        expect(initResult.transactions).toHaveTransaction({
            from: owner.address,
            on: pool.address,
            success: true,
        });
    });

    it('should update pool success', async () => {
        const currentSeconds = Math.floor(Date.now() / 1000);
        const durationInSeconds = 6 * 60 * 60; // 6 hours
        const whitelist: WhitelistTier[] = [
            {
                address: contributor.address,
                tier: 1,
                startTime: currentSeconds,
                duration: durationInSeconds,
            },
        ];

        const dictionary = generateTierDictionary(whitelist);
        const tierDictCell = beginCell().storeDictDirect(dictionary).endCell();
        const merkleRoot = BigInt('0x' + tierDictCell.hash().toString('hex'));

        const proofIdx = 0n;
        const merkleProof = dictionary.generateMerkleProof(proofIdx);

        const updateTx = await pool.sendUpdatePool(owner.getSender(), {
            value: toNano('0.09'),
            merkleRoot,
        });

        expect(updateTx.transactions).toHaveTransaction({
            from: owner.address,
            on: pool.address,
            success: true,
        });
    });
});
