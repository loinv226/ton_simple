import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, Cell, Dictionary, beginCell, toNano } from '@ton/core';
import { TonSimple } from '../wrappers/TonSimple';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { JettonMinter } from '../wrappers/JettonMinter';
import { JettonWallet } from '../wrappers/JettonWallet';
import { ActiveJettonWallet } from '../wrappers/utils';

describe('TonSimple', () => {
    let code: Cell;
    let minter_code = new Cell();
    let wallet_code = new Cell();

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let tonSimple: SandboxContract<TonSimple>;

    let notDeployer: SandboxContract<TreasuryContract>;
    let jettonMinter: SandboxContract<JettonMinter>;
    let poolJettonWallet: SandboxContract<JettonWallet>;
    let deployerJettonWallet: SandboxContract<JettonWallet>;

    let defaultContent: Cell;

    let userWallet: (address: Address) => Promise<SandboxContract<JettonWallet>>;

    beforeAll(async () => {
        code = await compile('TonSimple');
        minter_code = await compile('JettonMinter');
        wallet_code = await compile('JettonWallet');

        blockchain = await Blockchain.create();

        // const _libs = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell());
        // _libs.set(BigInt(`0x${wallet_code.hash().toString('hex')}`), wallet_code);
        // const libs = beginCell().storeDictDirect(_libs).endCell();
        // blockchain.libs = libs;

        deployer = await blockchain.treasury('deployer');

        defaultContent = beginCell().endCell();
        jettonMinter = blockchain.openContract(
            await JettonMinter.createFromConfig(
                {
                    admin: deployer.address,
                    content: defaultContent,
                    wallet_code,
                },
                minter_code,
            ),
        );

        userWallet = async (address: Address) => {
            return blockchain.openContract(
                JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(address)),
            );
        };

        const deployJettonMinterResult = await jettonMinter.sendDeploy(deployer.getSender(), toNano('1'));
        deployerJettonWallet = await userWallet(deployer.address);

        expect(deployJettonMinterResult.transactions).toHaveTransaction({
            from: deployer.address,
            on: jettonMinter.address,
            deploy: true,
        });

        tonSimple = blockchain.openContract(
            TonSimple.createFromConfig(
                {
                    id: 0,
                    counter: 0,
                    jetton_minter: jettonMinter.address,
                    jetton_code: wallet_code,
                },
                code,
            ),
        );

        const deployResult = await tonSimple.sendDeploy(deployer.getSender(), toNano('10'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: tonSimple.address,
            deploy: true,
            success: true,
        });
    });

    beforeEach(async () => {});

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and tonSimple are ready to use
    });

    it('should deposit into pool', async () => {
        // deploy jetton wallet
        let initialTotalSupply = await jettonMinter.getTotalSupply();
        console.log('initialTotalSupply: ', initialTotalSupply);

        let initialJettonBalance = toNano('1000');

        // mint
        const mintResult = await jettonMinter.sendMint(
            deployer.getSender(),
            deployer.address,
            initialJettonBalance,
            toNano('0.06'),
            toNano('1'),
        );
        // console.log('mintResult: ', mintResult);

        expect(mintResult.transactions).toHaveTransaction({
            from: jettonMinter.address,
            on: deployerJettonWallet.address,
            success: true,
            // deploy: true,
        });
        expect(mintResult.transactions).toHaveTransaction({
            // excesses
            from: deployerJettonWallet.address,
            on: deployer.address,
            success: true,
        });

        expect(await deployerJettonWallet.getJettonBalance()).toEqual(initialJettonBalance);
        initialTotalSupply += initialJettonBalance;
        expect(await jettonMinter.getTotalSupply()).toEqual(initialTotalSupply);

        poolJettonWallet = await userWallet(tonSimple.address);

        // transfer
        let poolInitAmount = toNano('3');
        await deployerJettonWallet.sendTransfer(
            deployer.getSender(),
            toNano('2'),
            poolInitAmount,
            tonSimple.address,
            deployer.address,
            beginCell().endCell(),
            toNano('1'),
            beginCell().endCell(),
        );

        expect(await poolJettonWallet.getJettonBalance()).toEqual(poolInitAmount);
    });

    it('should increase counter', async () => {
        const increaser = deployer; // await blockchain.treasury('increaser');

        const counterBefore = await tonSimple.getCounter();

        console.log('counter before increasing', counterBefore);

        const increaseBy = Math.floor(Math.random() * 100);

        console.log('increasing by', increaseBy);

        let tonSimpleWalletAddress = await jettonMinter.getWalletAddress(tonSimple.address);
        console.log('tonSimpleWalletAddress: ', tonSimpleWalletAddress);

        console.log('poolJettonWallet before: ', await poolJettonWallet.getJettonBalance());

        const increaseResult = await tonSimple.sendIncrease(increaser.getSender(), {
            increaseBy,
            value: toNano('0.06'),
            pool_wallet: poolJettonWallet.address,
        });

        // console.log('increaseResult: ', increaseResult.transactions);

        console.log('poolJettonWallet after: ', await poolJettonWallet.getJettonBalance());

        const counterAfter = await tonSimple.getCounter();

        console.log('counter after increasing', counterAfter);

        expect(counterAfter).toBe(counterBefore + increaseBy);

        expect(increaseResult.transactions).toHaveTransaction({
            from: increaser.address,
            to: tonSimple.address,
            success: true,
        });

        // console.log('minter address: ', jettonMinter.address);
        // console.log('deployer address: ', deployer.address);
        // console.log('deployer wallet address: ', deployerJettonWallet.address);
        // console.log('tonSimple address: ', tonSimple.address);
        console.log('poolJettonWallet address: ', poolJettonWallet.address);

        expect(increaseResult.transactions).toHaveTransaction({
            from: tonSimple.address,
            on: poolJettonWallet.address,
            success: true,
        });
    });
});
