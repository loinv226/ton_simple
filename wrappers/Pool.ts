import {
    Address,
    beginCell,
    Builder,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Dictionary,
    Sender,
    SendMode,
    Slice,
} from '@ton/core';

export type PoolConfig = {
    masterAddress: Address;
    tokenVault: Address;
    currencyVault: Address;
    contributorCode: Cell;
};

export type WhitelistTier = {
    address: Address;
    tier: number;
    startTime: number;
    duration: number;
};

export const whitelistTierValue = {
    serialize: (src: WhitelistTier, buidler: Builder) => {
        buidler
            .storeAddress(src.address)
            .storeUint(src.tier, 8)
            .storeUint(src.startTime, 64)
            .storeUint(src.duration, 32);
    },
    parse: (src: Slice) => {
        return {
            address: src.loadAddress(),
            tier: src.loadUint(8),
            startTime: src.loadUint(64),
            duration: src.loadUint(32),
        };
    },
};

export function generateTierDictionary(entries: WhitelistTier[]): Dictionary<bigint, WhitelistTier> {
    const dict: Dictionary<bigint, WhitelistTier> = Dictionary.empty(Dictionary.Keys.BigUint(256), whitelistTierValue);

    for (let i = 0; i < entries.length; i++) {
        dict.set(BigInt(i), entries[i]);
    }

    return dict;
}

export function poolConfigToCell(config: PoolConfig): Cell {
    let settings = beginCell()
        .storeAddress(null) // authority
        .storeRef(beginCell().storeAddress(null).storeAddress(null).endCell()) //save token_mint and currency_mint
        .storeRef(beginCell().storeAddress(config.tokenVault).storeAddress(config.currencyVault).endCell())
        // start_time
        .storeUint(0, 64)
        // end_time;
        .storeUint(0, 64)
        // public_sale_start_time
        .storeUint(0, 64)
        // min_contribution
        .storeCoins(0)
        // max_contribution
        .storeCoins(0)
        // soft_cap
        .storeCoins(0)
        // hard_cap
        .storeCoins(0)
        // rate
        .storeUint(0, 32)
        // listing_percentage
        .storeUint(0, 8)
        // refund_type
        .storeUint(0, 8)
        // native_fee_percent
        .storeUint(0, 8)
        // token_fee_percent
        .storeUint(0, 8);

    let state = beginCell()
        .storeUint(0, 8) // state
        .storeCoins(0) // total_raised
        .storeCoins(0) // total_volume_purchased
        .storeUint(0, 32) // purchaser_count
        .storeUint(0, 64) // finish_time
        .storeUint(0, 64) // claim_time
        .storeUint(0, 256); // merkle_root

    let codes = beginCell().storeRef(config.contributorCode).endCell();

    return beginCell()
        .storeUint(0, 32) // index
        .storeUint(0, 8) // version
        .storeAddress(config.masterAddress)
        .storeRef(settings)
        .storeRef(state)
        .storeRef(codes)
        .endCell();
}

export const Opcodes = {
    init_pool: 0x38032463,
    contribute: 0x86c74136,
    payTo: 0x6322546b,
    cancel: 0xcc0f2526,
    claim: 0x13a3ca6,
    emergencyWithdraw: 0xf129aa95,
    finalize: 0x5b07133a,
    updatePool: 0xf8482c45,
};

export class Pool implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new Pool(address);
    }

    static createFromConfig(config: PoolConfig, code: Cell, workchain = 0) {
        const data = poolConfigToCell(config);
        const init = { code, data };
        return new Pool(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendInitPool(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            tokenAmount: bigint;
            owner: Address;
            queryID?: number;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.init_pool, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeCoins(opts.tokenAmount)
                .storeAddress(opts.owner)
                .storeRef(
                    beginCell()
                        .storeUint(0, 64)
                        .storeUint(0, 64)
                        .storeUint(0, 64)
                        .storeCoins(0)
                        .storeCoins(0)
                        .storeCoins(0)
                        .storeCoins(0)
                        .storeUint(0, 32)
                        .storeUint(0, 8)
                        .storeUint(0, 8)
                        .storeUint(0, 1)
                        .endCell(),
                )
                .endCell(),
        });
    }

    async sendFinalize(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryID?: number;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.finalize, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .endCell(),
        });
    }

    async sendUpdatePool(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            merkleRoot: bigint | null;
            queryID?: number;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.updatePool, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeMaybeUint(opts.merkleRoot, 256)
                .endCell(),
        });
    }

    async getID(provider: ContractProvider) {
        const result = await provider.get('get_id', []);
        return result.stack.readNumber();
    }

    async getContributorAddress(provider: ContractProvider, owner: Address) {
        const result = await provider.get('get_contributor_address', [
            { type: 'slice', cell: beginCell().storeAddress(owner).endCell() },
        ]);
        return result.stack.readAddress();
    }

    async getPoolInfo(provider: ContractProvider) {
        const result = await provider.get('get_pool_info', []);

        return {
            state: result.stack.readNumber(),
            total_raised: result.stack.readBigNumber(),
            total_volume_purchased: result.stack.readBigNumber(),
            purchaser_count: result.stack.readBigNumber(),
            finish_time: result.stack.readBigNumber(),
            claim_time: result.stack.readBigNumber(),
            authority: result.stack.readAddress(),
            merkleRoot: result.stack.readBigNumber(),
        };
    }
}
