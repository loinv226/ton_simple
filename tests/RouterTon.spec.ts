import { Blockchain, SandboxContract, SendMessageResult, TreasuryContract } from '@ton/sandbox';
import { Address, Cell, ExternalAddress, Slice, beginCell, toNano } from '@ton/core';
import { Router } from '../wrappers/Router';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { JettonMinter } from '../wrappers/JettonMinter';
import { JettonWallet } from '../wrappers/JettonWallet';
import { generateTierDictionary, Pool, WhitelistTier } from '../wrappers/Pool';
import { ContributorAccount } from '../wrappers/ContributorAccount';
import { buildLibs } from '../libs';
import { expectBounced, expectEqAddress, expectNotBounced } from '../libs/src/test-helpers';
import { PTonMinterV2 } from '../wrappers/PTMinter';
import { PTonWalletV2 } from '../wrappers/PTWallet';

type SBCtrTreasury = SandboxContract<TreasuryContract>;
type SBCtrMinter = SandboxContract<PTonMinterV2>;
type SBCtrWallet = SandboxContract<PTonWalletV2>;

type SendParams = {
    tonAmount: bigint;
    gas: bigint;
    refundAddress?: Address | ExternalAddress | null;
    debugGraph?: string;
    payload?: Cell | Slice;
    wallet: SBCtrWallet;
    sender?: SBCtrTreasury;
    expectBounce?: boolean;
    expectRefund?: boolean;
    txValue?: bigint;
    payloadOverride?: boolean;
};

type WalletParams = {
    owner: Address;
    debugGraph?: string;
    label: string;
};

describe('Router', () => {
    let code: Cell;
    let poolCode: Cell;
    let contributorCode: Cell;

    let minter_code = new Cell();
    let wallet_code = new Cell();

    let ptonCode: { minter: Cell; wallet: Cell };

    let blockchain: Blockchain;
    let router: SandboxContract<Router>;

    let admin: SBCtrTreasury;
    let poolOwner: SBCtrTreasury;
    let contributor: SBCtrTreasury;

    let jettonMinter: SandboxContract<JettonMinter>;
    let tokenVaultWallet: SandboxContract<JettonWallet>;
    let poolOwnerJettonWallet: SandboxContract<JettonWallet>;

    let proxyMinter: SBCtrMinter;
    let currencyVaultWallet: SBCtrWallet;
    let contributorCurrencyWallet: SBCtrWallet;

    let defaultContent: Cell;

    let addressMap = new Map();
    let bracketMap = new Map();

    let tokenWallet: (address: Address) => Promise<SandboxContract<JettonWallet>>;
    let sendTon: (params: SendParams) => Promise<
        SendMessageResult & {
            result: void;
        }
    >;
    let deployPTonWallet: (params: WalletParams) => Promise<SBCtrWallet>;

    beforeAll(async () => {
        code = await compile('Router');
        poolCode = await compile('Pool');
        contributorCode = await compile('ContributorAccount');

        minter_code = await compile('JettonMinter');
        wallet_code = await compile('JettonWallet');

        const _code = {
            minter: await compile('PTMinter'),
            wallet: await compile('PTWallet'),
        };

        blockchain = await Blockchain.create();

        const libs = buildLibs(_code);
        blockchain.libs = libs;

        ptonCode = {
            minter: _code.minter,
            wallet: _code.wallet,
        };

        admin = await blockchain.treasury('admin');
        poolOwner = await blockchain.treasury('poolOwner');
        contributor = await blockchain.treasury('contributor');

        // deploy router
        router = blockchain.openContract(
            Router.createFromConfig(
                {
                    id: 0,
                    creationFee: 0,
                    feeReceiver: poolOwner.address,
                    nativeFeeOnlyPercent: 0,
                    nativeFeePercent: 0,
                    tokenFeePercent: 0,
                    poolCode,
                    contributorCode,
                },
                code,
            ),
        );

        const deployResult = await router.sendDeploy(admin.getSender(), toNano('10'));

        expect(deployResult.transactions).toHaveTransaction({
            from: admin.address,
            to: router.address,
            // deploy: true,
            // success: true,
        });

        // jetton
        defaultContent = beginCell().endCell();
        jettonMinter = blockchain.openContract(
            await JettonMinter.createFromConfig(
                {
                    admin: poolOwner.address,
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

        const deployJettonMinterResult = await jettonMinter.sendDeploy(poolOwner.getSender(), toNano('1'));
        poolOwnerJettonWallet = await tokenWallet(poolOwner.address);

        expect(deployJettonMinterResult.transactions).toHaveTransaction({
            from: poolOwner.address,
            on: jettonMinter.address,
            deploy: true,
        });

        // mint token
        let initialTotalSupply = await jettonMinter.getTotalSupply();
        console.log('initialTotalSupply: ', initialTotalSupply);

        let initialJettonBalance = toNano('100000');

        // mint
        const mintResult = await jettonMinter.sendMint(
            poolOwner.getSender(),
            poolOwner.address,
            initialJettonBalance,
            toNano('0.06'),
            toNano('1'),
        );
        // console.log('mintResult: ', mintResult);

        expect(mintResult.transactions).toHaveTransaction({
            from: jettonMinter.address,
            on: poolOwnerJettonWallet.address,
            success: true,
            // deploy: true,
        });
        expect(mintResult.transactions).toHaveTransaction({
            // excesses
            from: poolOwnerJettonWallet.address,
            on: poolOwner.address,
            success: true,
        });

        expect(await poolOwnerJettonWallet.getJettonBalance()).toEqual(initialJettonBalance);
        initialTotalSupply += initialJettonBalance;
        expect(await jettonMinter.getTotalSupply()).toEqual(initialTotalSupply);

        // // deploy currency token
        proxyMinter = blockchain.openContract(
            PTonMinterV2.createFromConfig(
                {
                    walletCode: ptonCode.wallet,
                    content: defaultContent,
                    // content: metadataCell(onchainMetadata({ name: 'Test' })),
                },
                ptonCode.minter,
            ),
        );

        // console.log('ptonCode: ', ptonCode);
        const msgResult = await proxyMinter.sendDeploy(admin.getSender(), toNano('5'));
        expectNotBounced(msgResult.events);
        expect(msgResult.transactions).toHaveTransaction({
            from: admin.address,
            to: proxyMinter.address,
            deploy: true,
        });

        deployPTonWallet = async (params: WalletParams) => {
            let walletAddress = await proxyMinter.getWalletAddress(params.owner);
            let wallet = blockchain.openContract(PTonWalletV2.createFromAddress(walletAddress));
            addressMap.set(walletAddress.toString(), `${params.label}<br/>pTon Wallet`);

            let msgResult = await proxyMinter.sendDeployWallet(
                admin.getSender(),
                {
                    ownerAddress: params.owner,
                    excessesAddress: admin.address,
                },
                toNano(5),
            );

            expectNotBounced(msgResult.events);
            // if (params.debugGraph) {
            //     createMDGraphLocal({
            //         msgResult: msgResult,
            //         addressMap: addressMap,
            //         bracketMap: bracketMap,
            //         output: params.debugGraph,
            //     });
            // }

            const data = await wallet.getWalletData();
            expectEqAddress(data.ownerAddress, params.owner);

            return wallet;
        };

        sendTon = async (params: SendParams) => {
            const sender = params.sender ?? admin;

            const oldData = await params.wallet.getWalletData();

            let msgResult = await params.wallet.sendTonTransfer(
                sender.getSender(),
                {
                    tonAmount: params.tonAmount,
                    gas: params.gas,
                    fwdPayload: params.payload!,
                    refundAddress: typeof params.refundAddress === 'undefined' ? sender.address : params.refundAddress,
                    noPayloadOverride: params.payloadOverride,
                },
                params.txValue,
            );
            // if (params.debugGraph) {
            //     createMDGraphLocal({
            //         msgResult: msgResult,
            //         addressMap: addressMap,
            //         bracketMap: bracketMap,
            //         output: params.debugGraph,
            //     });
            // }
            const data = await params.wallet.getWalletData();
            if (params.expectBounce || params.expectRefund) {
                if (params.expectBounce) {
                    expectBounced(msgResult.events);
                } else {
                    expectNotBounced(msgResult.events);
                }

                expect(data.balance).toEqual(oldData.balance);
            } else {
                expectNotBounced(msgResult.events);
                expect(data.balance).toEqual(oldData.balance + params.tonAmount);
            }

            return msgResult;
        };

        contributorCurrencyWallet = await deployPTonWallet({
            label: 'Contribute wallet',
            owner: router.address,
        });

        currencyVaultWallet = await deployPTonWallet({
            label: 'Currency Vault',
            owner: router.address,
        });
    });

    beforeEach(async () => {});

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and router are ready to use
    });

    it('should init pool success ', async () => {
        tokenVaultWallet = await tokenWallet(router.address);

        const gasAmount = toNano('1');
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
        const transferResult = await poolOwnerJettonWallet.sendTransfer(
            poolOwner.getSender(),
            gasAmount,
            poolInitAmount,
            router.address,
            poolOwner.address,
            beginCell().endCell(),
            forwardTonAmount,
            forwardPayload,
        );
        const balance = await tokenVaultWallet.getJettonBalance();

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
        const gasAmount = toNano('1');
        let contributeAmount = toNano('1');

        const poolAddress = await router.getPoolAddress(tokenVaultWallet.address, currencyVaultWallet.address);
        const pool = blockchain.openContract(Pool.createFromAddress(poolAddress));

        // add contributor to whitelist
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

        const updateTx = await pool.sendUpdatePool(poolOwner.getSender(), {
            value: toNano('0.09'),
            merkleRoot,
        });

        expect(updateTx.transactions).toHaveTransaction({
            from: poolOwner.address,
            on: pool.address,
            success: true,
        });

        const poolInfo = await pool.getPoolInfo();
        expect(BigInt(poolInfo.merkleRoot)).toEqual(merkleRoot);

        const forwardPayload = router.createContributeBody({
            tokenVault: tokenVaultWallet.address,
            index: proofIdx,
            proof: merkleProof,
        });

        // transfer
        // const transferResult = await contributorCurrencyWallet.sendTransfer(
        //     contributor.getSender(),
        //     gasAmount,
        //     contributeAmount,
        //     router.address,
        //     contributor.address,
        //     beginCell().endCell(),
        //     forwardTonAmount,
        //     forwardPayload,
        // );
        const transferResult = await sendTon({
            sender: contributor,
            tonAmount: contributeAmount,
            gas: gasAmount,
            wallet: contributorCurrencyWallet,
            payload: forwardPayload,
            expectBounce: false,
            expectRefund: false,
        });

        const { balance: currencyVaultbalance } = await currencyVaultWallet!.getWalletData();

        expect(currencyVaultbalance).toEqual(contributeAmount);

        expect(transferResult.transactions).toHaveTransaction({
            from: router.address,
            on: poolAddress,
            success: true,
        });

        const contributorAddress = await pool.getContributorAddress(contributor.address);

        expect(transferResult.transactions).toHaveTransaction({
            from: pool.address,
            on: contributorAddress,
            deploy: true,
        });

        const contributorAccount = blockchain.openContract(ContributorAccount.createFromAddress(contributorAddress));
        const contributedAmount = await contributorAccount.getContributeAmount();
        expect(BigInt(contributedAmount)).toEqual(contributeAmount);
    });

    it('should finalize success ', async () => {
        const poolAddress = await router.getPoolAddress(tokenVaultWallet.address, currencyVaultWallet.address);
        console.log('poolAddress: ', poolAddress);
        const pool = blockchain.openContract(Pool.createFromAddress(poolAddress));

        const { balance: currencyVaultbalanceBefore } = await currencyVaultWallet.getWalletData();
        const poolOwnerBalanceBefore = await poolOwner.getBalance();

        const finalizeTxResult = await pool.sendFinalize(poolOwner.getSender(), {
            value: toNano('0.09'),
        });

        expect(finalizeTxResult.transactions).toHaveTransaction({
            from: pool.address,
            on: router.address,
            success: true,
        });

        expect(finalizeTxResult.transactions).toHaveTransaction({
            from: router.address,
            on: currencyVaultWallet.address,
            success: true,
        });

        expect(finalizeTxResult.transactions).toHaveTransaction({
            from: currencyVaultWallet.address,
            on: poolOwner.address,
            success: true,
        });

        const { balance: currencyVaultbalance } = await currencyVaultWallet.getWalletData();

        expect(currencyVaultbalance).toEqual(0n);
    });

    it('should claim success ', async () => {
        const poolAddress = await router.getPoolAddress(tokenVaultWallet.address, currencyVaultWallet.address);
        const pool = blockchain.openContract(Pool.createFromAddress(poolAddress));

        const contributorAddress = await pool.getContributorAddress(contributor.address);

        const contributorAccount = blockchain.openContract(ContributorAccount.createFromAddress(contributorAddress));

        const claimTxResult = await contributorAccount.sendClaim(contributor.getSender(), {
            value: toNano('0.09'),
        });

        expect(claimTxResult.transactions).toHaveTransaction({
            from: contributorAccount.address,
            on: pool.address,
            success: true,
        });

        expect(claimTxResult.transactions).toHaveTransaction({
            from: pool.address,
            on: router.address,
            success: true,
        });

        expect(claimTxResult.transactions).toHaveTransaction({
            from: router.address,
            on: tokenVaultWallet.address,
            success: true,
        });

        const purchasedAmount = await contributorAccount.getPurchasedAmount();

        const contributorTokenWallet = await tokenWallet(contributor.address);
        const purchasedBalance = await contributorTokenWallet.getJettonBalance();

        expect(purchasedBalance).toEqual(BigInt(purchasedAmount));
    });
});
