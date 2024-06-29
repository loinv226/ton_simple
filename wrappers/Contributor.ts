import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type ContributorConfig = {
    masterAddress: Address;
    tokenVault: Address;
    currencyVault: Address;
};

export function poolConfigToCell(config: ContributorConfig): Cell {
    return beginCell()
        .storeAddress(null)
        .storeAddress(null)
        .storeUint(0, 64)
        .storeUint(0, 64)
        .storeCoins(0)
        .storeCoins(0)
        .storeUint(0, 64)
        .endCell();
}

export const Opcodes = {
    contribute: 0x86c74136,
};

export class Contributor implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new Contributor(address);
    }

    static createFromConfig(config: ContributorConfig, code: Cell, workchain = 0) {
        const data = poolConfigToCell(config);
        const init = { code, data };
        return new Contributor(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendPurchase(
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
            sendMode: SendMode.CARRY_ALL_REMAINING_INCOMING_VALUE,
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

    async getID(provider: ContractProvider) {
        const result = await provider.get('get_id', []);
        return result.stack.readNumber();
    }
}
