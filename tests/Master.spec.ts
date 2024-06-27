import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, Cell, Dictionary, beginCell, toNano } from '@ton/core';
import { Master } from '../wrappers/Master';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { JettonMinter } from '../wrappers/JettonMinter';
import { JettonWallet } from '../wrappers/JettonWallet';
import { ActiveJettonWallet } from '../utils/utils';
import { createJettonTransferMessage } from '../utils/jetton_utils';

describe('Master', () => {
    let code: Cell;
    let poolCode = new Cell();

    let minter_code = new Cell();

    let wallet_code = new Cell();

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let master: SandboxContract<Master>;

    let notDeployer: SandboxContract<TreasuryContract>;
    let jettonMinter: SandboxContract<JettonMinter>;
    let tokenVaultWallet: SandboxContract<JettonWallet>;
    let currencyVaultWallet: SandboxContract<JettonWallet>;
    let deployerJettonWallet: SandboxContract<JettonWallet>;

    let currencyJettonMinter: SandboxContract<JettonMinter>;

    let defaultContent: Cell;

    let tokenWallet: (address: Address) => Promise<SandboxContract<JettonWallet>>;
    let currencyWallet: (address: Address) => Promise<SandboxContract<JettonWallet>>;

    beforeAll(async () => {
        code = await compile('Master');
        poolCode = await compile('Pool');
        minter_code = await compile('JettonMinter');
        wallet_code = await compile('JettonWallet');

        blockchain = await Blockchain.create();

        // const _libs = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell());
        // _libs.set(BigInt(`0x${wallet_code.hash().toString('hex')}`), wallet_code);
        // const libs = beginCell().storeDictDirect(_libs).endCell();
        // blockchain.libs = libs;

        deployer = await blockchain.treasury('deployer');
        notDeployer = await blockchain.treasury('notDeployer');

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

        tokenWallet = async (address: Address) => {
            return blockchain.openContract(
                JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(address)),
            );
        };

        const deployJettonMinterResult = await jettonMinter.sendDeploy(deployer.getSender(), toNano('1'));
        deployerJettonWallet = await tokenWallet(deployer.address);

        expect(deployJettonMinterResult.transactions).toHaveTransaction({
            from: deployer.address,
            on: jettonMinter.address,
            deploy: true,
        });

        // deploy currency token
        currencyJettonMinter = blockchain.openContract(
            await JettonMinter.createFromConfig(
                {
                    admin: notDeployer.address,
                    content: defaultContent,
                    wallet_code,
                },
                minter_code,
            ),
        );

        currencyWallet = async (address: Address) => {
            return blockchain.openContract(
                JettonWallet.createFromAddress(await currencyJettonMinter.getWalletAddress(address)),
            );
        };

        const deployCurrencyJettonMinterResult = await currencyJettonMinter.sendDeploy(
            notDeployer.getSender(),
            toNano('1'),
        );

        expect(deployCurrencyJettonMinterResult.transactions).toHaveTransaction({
            from: notDeployer.address,
            on: currencyJettonMinter.address,
            deploy: true,
        });

        // mint token
        let initialTotalSupply = await jettonMinter.getTotalSupply();
        console.log('initialTotalSupply: ', initialTotalSupply);

        let initialJettonBalance = toNano('100000');

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

        // deploy master
        master = blockchain.openContract(
            Master.createFromConfig(
                {
                    id: 0,
                    creationFee: 0,
                    feeReceiver: deployer.address,
                    nativeFeeOnlyPercent: 0,
                    nativeFeePercent: 0,
                    tokenFeePercent: 0,
                    poolCode,
                },
                code,
            ),
        );

        const deployResult = await master.sendDeploy(deployer.getSender(), toNano('10'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: master.address,
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
        tokenVaultWallet = await tokenWallet(master.address);
        currencyVaultWallet = await currencyWallet(master.address);

        const gasAmount = toNano('5');
        const forwardTonAmount = toNano('0.24');
        let poolInitAmount = toNano('10000');

        const forwardPayload = master.createInitPoolBody({
            currencyVault: currencyVaultWallet.address,
            start_time: 0n,
            end_time: 0n,
            public_sale_start_time: 0n,
            min_contribution: 0n,
            max_contribution: 0n,
            soft_cap: 0n,
            hard_cap: 0n,
            rate: 0n,
            listing_percentage: 0,
            refund_type: 0,
            use_native_fee_only: 0,
        });

        // const msg = createJettonTransferMessage({
        //     queryId: 0n,
        //     amount: poolInitAmount,
        //     destination: master.address,
        //     responseDestination: deployer.address,
        //     forwardPayload,
        //     forwardTonAmount,
        // });

        // transfer
        await deployerJettonWallet.sendTransfer(
            deployer.getSender(),
            gasAmount,
            poolInitAmount,
            master.address,
            deployer.address,
            beginCell().endCell(),
            forwardTonAmount,
            forwardPayload,
        );
        const balance = await tokenVaultWallet.getJettonBalance();
        console.log('balance: ', balance);

        expect(balance).toEqual(poolInitAmount);
    });
});
