import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type TonSimpleConfig = {
    id: number;
    counter: number;
    jetton_minter: Address;
    jetton_code: Cell;
};

export function tonSimpleConfigToCell(config: TonSimpleConfig): Cell {
    let codes = beginCell().storeRef(config.jetton_code).endCell();

    return beginCell()
        .storeUint(config.id, 32)
        .storeUint(config.counter, 32)
        .storeAddress(config.jetton_minter)
        .storeAddress(null)
        .storeRef(codes)
        .endCell();
}

export const Opcodes = {
    increase: 0x7e8764ef,
};

export class TonSimple implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new TonSimple(address);
    }

    static createFromConfig(config: TonSimpleConfig, code: Cell, workchain = 0) {
        const data = tonSimpleConfigToCell(config);
        const init = { code, data };
        return new TonSimple(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendIncrease(
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
                .storeUint(Opcodes.increase, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeUint(opts.increaseBy, 32)
                .storeAddress(opts.pool_wallet)
                .endCell(),
        });
    }

    async getCounter(provider: ContractProvider) {
        const result = await provider.get('get_counter', []);
        return result.stack.readNumber();
    }

    async getID(provider: ContractProvider) {
        const result = await provider.get('get_id', []);
        return result.stack.readNumber();
    }

    async getJetton(provider: ContractProvider) {
        const result = await provider.get('get_jetton', []);
        return result.stack.readAddress();
    }
}
