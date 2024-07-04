import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, Cell, Dictionary, beginCell, toNano } from '@ton/core';
import { Router } from '../wrappers/Router';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { JettonMinter } from '../wrappers/JettonMinter';
import { JettonWallet } from '../wrappers/JettonWallet';
import { Pool } from '../wrappers/Pool';
import { Contributor } from '../wrappers/Contributor';

describe('Router', () => {
    let code: Cell;
    let poolCode: Cell;
    let contributorCode: Cell;

    let minter_code = new Cell();
    let wallet_code = new Cell();

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let router: SandboxContract<Router>;

    let notDeployer: SandboxContract<TreasuryContract>;
    let jettonMinter: SandboxContract<JettonMinter>;
    let tokenVaultWallet: SandboxContract<JettonWallet>;
    let currencyVaultWallet: SandboxContract<JettonWallet>;
    let deployerJettonWallet: SandboxContract<JettonWallet>;

    let currencyJettonMinter: SandboxContract<JettonMinter>;
    let notDeployerCurrencyWallet: SandboxContract<JettonWallet>;

    let defaultContent: Cell;

    let tokenWallet: (address: Address) => Promise<SandboxContract<JettonWallet>>;
    let currencyWallet: (address: Address) => Promise<SandboxContract<JettonWallet>>;

    beforeAll(async () => {
        code = await compile('Router');
        poolCode = await compile('Pool');
        contributorCode = await compile('Contributor');

        minter_code = await compile('JettonMinter');
        wallet_code = await compile('JettonWallet');

        blockchain = await Blockchain.create();

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
        // mint currency
        notDeployerCurrencyWallet = await currencyWallet(notDeployer.address);

        let initialTotalSupplyCurrency = await currencyJettonMinter.getTotalSupply();
        console.log('initialTotalSupplyCurrency: ', initialTotalSupplyCurrency);

        let initialJettonCurrencyBalance = toNano('100000');

        // mint
        const mintCurrencyResult = await currencyJettonMinter.sendMint(
            notDeployer.getSender(),
            notDeployer.address,
            initialJettonCurrencyBalance,
            toNano('0.06'),
            toNano('1'),
        );
        // console.log('mintResult: ', mintResult);

        expect(mintCurrencyResult.transactions).toHaveTransaction({
            from: currencyJettonMinter.address,
            on: notDeployerCurrencyWallet.address,
            success: true,
        });
        expect(mintCurrencyResult.transactions).toHaveTransaction({
            // excesses
            from: notDeployerCurrencyWallet.address,
            on: notDeployer.address,
            success: true,
        });

        expect(await notDeployerCurrencyWallet.getJettonBalance()).toEqual(initialJettonCurrencyBalance);
        initialTotalSupplyCurrency += initialJettonCurrencyBalance;
        expect(await currencyJettonMinter.getTotalSupply()).toEqual(initialTotalSupplyCurrency);

        // deploy router
        router = blockchain.openContract(
            Router.createFromConfig(
                {
                    id: 0,
                    creationFee: 0,
                    feeReceiver: deployer.address,
                    nativeFeeOnlyPercent: 0,
                    nativeFeePercent: 0,
                    tokenFeePercent: 0,
                    poolCode,
                    contributorCode,
                },
                code,
            ),
        );

        const deployResult = await router.sendDeploy(deployer.getSender(), toNano('10'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: router.address,
            deploy: true,
            success: true,
        });
    });

    beforeEach(async () => {});

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and router are ready to use
    });

    it('should init pool success ', async () => {
        tokenVaultWallet = await tokenWallet(router.address);
        currencyVaultWallet = await currencyWallet(router.address);

        const gasAmount = toNano('20');
        const forwardTonAmount = toNano('0.24');
        let poolInitAmount = toNano('10000');

        const forwardPayload = router.createInitPoolBody({
            currencyVault: currencyVaultWallet.address,
            start_time: 0n,
            end_time: 0n,
            public_sale_start_time: 0n,
            min_contribution: 0n,
            max_contribution: 0n,
            soft_cap: 0n,
            hard_cap: 50n,
            rate: 0n,
            listing_percentage: 0,
            refund_type: 0,
            use_native_fee_only: 0,
        });

        // transfer
        const transferResult = await deployerJettonWallet.sendTransfer(
            deployer.getSender(),
            gasAmount,
            poolInitAmount,
            router.address,
            deployer.address,
            beginCell().endCell(),
            forwardTonAmount,
            forwardPayload,
        );
        const balance = await tokenVaultWallet.getJettonBalance();
        console.log('balance: ', balance);

        expect(balance).toEqual(poolInitAmount);

        const poolAddress = await router.getPoolAddress(tokenVaultWallet.address, currencyVaultWallet.address);
        console.log('poolAddress: ', poolAddress);

        expect(transferResult.transactions).toHaveTransaction({
            from: router.address,
            on: poolAddress,
            deploy: true,
        });
    });

    it('should contribute success ', async () => {
        const gasAmount = toNano('20');
        const forwardTonAmount = toNano('2');
        let contributeAmount = toNano('1');

        const forwardPayload = router.createContributeBody({
            tokenVault: tokenVaultWallet.address,
            index: 0n,
            tier: 0n,
        });

        // transfer
        const transferResult = await notDeployerCurrencyWallet.sendTransfer(
            notDeployer.getSender(),
            gasAmount,
            contributeAmount,
            router.address,
            notDeployer.address,
            beginCell().endCell(),
            forwardTonAmount,
            forwardPayload,
        );
        const currencyVaultbalance = await currencyVaultWallet.getJettonBalance();
        console.log('currencyVaultbalance: ', currencyVaultbalance);

        expect(currencyVaultbalance).toEqual(contributeAmount);

        const poolAddress = await router.getPoolAddress(tokenVaultWallet.address, currencyVaultWallet.address);
        console.log('poolAddress: ', poolAddress);

        expect(transferResult.transactions).toHaveTransaction({
            from: router.address,
            on: poolAddress,
            success: true,
        });

        const pool = blockchain.openContract(Pool.createFromAddress(poolAddress));
        const contributorAddress = await pool.getContributorAddress(notDeployer.address);
        console.log('contributor: ', contributorAddress);

        expect(transferResult.transactions).toHaveTransaction({
            from: pool.address,
            on: contributorAddress,
            deploy: true,
        });

        const contributor = blockchain.openContract(Contributor.createFromAddress(contributorAddress));
        const contributedAmount = await contributor.getContributeAmount();
        console.log('contributedAmount: ', contributedAmount);
    });
});
