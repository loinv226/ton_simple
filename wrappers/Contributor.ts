import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type ContributorConfig = {
    owner: Address;
    pool: Address;
};

export function configToCell(config: ContributorConfig): Cell {
    return beginCell()
        .storeAddress(config.owner)
        .storeAddress(config.pool)
        .storeCoins(0) //contribute_amount
        .storeCoins(0) //purchased_amount
        .storeCoins(0) //claimed_amount
        .endCell();
}

export const Opcodes = {
    contribute: 0x86c74136,
    payTo: 0x6322546b,
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
        const data = configToCell(config);
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

    async sendContribute(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            contributeAmount: bigint;
            owner: Address;
            purchaseAmount: bigint;
            queryID?: number;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.CARRY_ALL_REMAINING_INCOMING_VALUE,
            body: beginCell()
                .storeUint(Opcodes.contribute, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeCoins(opts.contributeAmount)
                .storeAddress(opts.owner)
                .storeCoins(opts.purchaseAmount)
                .endCell(),
        });
    }

    async getContributeAmount(provider: ContractProvider) {
        const result = await provider.get('get_contribute_amount', []);
        return result.stack.readNumber();
    }

    async getPurchasedAmount(provider: ContractProvider) {
        const result = await provider.get('get_purchased_amount', []);
        return result.stack.readNumber();
    }

    async getClaimedAmount(provider: ContractProvider) {
        const result = await provider.get('get_claimed_amount', []);
        return result.stack.readNumber();
    }
}
