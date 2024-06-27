import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type MasterConfig = {
    id: number;
    feeReceiver: Address;
    creationFee: number;
    nativeFeePercent: number;
    tokenFeePercent: number;
    nativeFeeOnlyPercent: number;
    // operators: Address[];
    // currencies:  Address[];
    poolCode: Cell;
    // authority: Address;
};

export function masterConfigToCell(config: MasterConfig): Cell {
    const masterConfig = beginCell()
        .storeAddress(config.feeReceiver)
        .storeCoins(config.creationFee)
        .storeUint(config.nativeFeePercent, 8)
        .storeUint(config.tokenFeePercent, 8)
        .storeUint(config.nativeFeeOnlyPercent, 8)
        .endCell();

    let codes = beginCell().storeRef(config.poolCode).endCell();

    return beginCell().storeUint(config.id, 32).storeRef(masterConfig).storeRef(codes).endCell();
}

export const Opcodes = {
    init_pool: 0x38032463,
    contribute: 0x86c74136,
    cancel: 0xcc0f2526,
    claim: 0x13a3ca6,
    emergency_withdraw: 0xf129aa95,
    finalize: 0x5b07133a,
};

export class Master implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new Master(address);
    }

    static createFromConfig(config: MasterConfig, code: Cell, workchain = 0) {
        const data = masterConfigToCell(config);
        const init = { code, data };
        return new Master(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async initPool(
        provider: ContractProvider,
        via: Sender,
        opts: {
            increaseBy: number;
            value: bigint;
            pool_wallet: Address;
            queryID?: number;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.init_pool, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeUint(opts.increaseBy, 32)
                .storeAddress(opts.pool_wallet)
                .endCell(),
        });
    }

    createInitPoolBody(params: {
        currencyVault: Address;
        start_time: bigint;
        end_time: bigint;
        public_sale_start_time: bigint;
        min_contribution: bigint;
        max_contribution: bigint;
        soft_cap: bigint;
        hard_cap: bigint;
        rate: bigint;
        listing_percentage: number;
        refund_type: number;
        use_native_fee_only: number;
        //
        customPayload?: Cell;
        customPayloadForwardGasAmount?: bigint;
    }): Cell {
        return beginCell()
            .storeUint(Opcodes.init_pool, 32)
            .storeAddress(params.currencyVault)
            .storeRef(
                beginCell()
                    .storeUint(params.start_time, 64)
                    .storeUint(params.end_time, 64)
                    .storeUint(params.public_sale_start_time, 64)
                    .storeCoins(params.min_contribution)
                    .storeCoins(params.max_contribution)
                    .storeCoins(params.soft_cap)
                    .storeCoins(params.hard_cap)
                    .storeCoins(params.rate)
                    .storeUint(params.listing_percentage, 8)
                    .storeUint(params.refund_type, 8)
                    .storeUint(params.use_native_fee_only, 1)
                    .storeCoins(params.customPayloadForwardGasAmount ?? 0n)
                    .storeMaybeRef(params.customPayload)
                    .endCell(),
            )
            .endCell();
    }

    async getID(provider: ContractProvider) {
        const result = await provider.get('get_id', []);
        return result.stack.readNumber();
    }
}
