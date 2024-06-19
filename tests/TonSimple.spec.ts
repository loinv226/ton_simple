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

        const deployResult = await tonSimple.sendDeploy(deployer.getSender(), toNano('0.05'));

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

        poolJettonWallet = await userWallet(tonSimple.address);
        let initialJettonBalance = toNano('1000');
        console.log('poolJettonWallet: ', poolJettonWallet.address);

        const mintResult = await jettonMinter.sendMint(
            deployer.getSender(),
            tonSimple.address,
            initialJettonBalance,
            toNano('0.05'),
            toNano('1'),
        );
        // console.log('mintResult: ', mintResult);

        console.log('poolJettonWallet.getJettonBalance(): ', await poolJettonWallet.getJettonBalance());

        expect(mintResult.transactions).toHaveTransaction({
            from: jettonMinter.address,
            on: poolJettonWallet.address,
            success: true,
            // deploy: true,
        });
        // expect(mintResult.transactions).toHaveTransaction({
        //     // excesses
        //     from: poolJettonWallet.address,
        //     on: deployer.address,
        // });

        expect(await poolJettonWallet.getJettonBalance()).toEqual(initialJettonBalance);
        expect(await jettonMinter.getTotalSupply()).toEqual(initialTotalSupply + initialJettonBalance);
        initialTotalSupply += initialJettonBalance;
    });

    it('should increase counter', async () => {
        const increaser = await blockchain.treasury('increaser');

        const counterBefore = await tonSimple.getCounter();

        console.log('counter before increasing', counterBefore);

        const increaseBy = Math.floor(Math.random() * 100);

        console.log('increasing by', increaseBy);

        const increaseResult = await tonSimple.sendIncrease(increaser.getSender(), {
            increaseBy,
            value: toNano('0.05'),
        });

        console.log('increaseResult: ', increaseResult);

        expect(increaseResult.transactions).toHaveTransaction({
            from: increaser.address,
            to: tonSimple.address,
            success: true,
        });

        // expect(increaseResult.transactions).toHaveTransaction({
        //     from: poolJettonWallet.address,
        //     to: poolJettonWallet.address,
        //     // success: true,
        // });

        const counterAfter = await tonSimple.getCounter();

        console.log('counter after increasing', counterAfter);

        expect(counterAfter).toBe(counterBefore + increaseBy);
    });
});
