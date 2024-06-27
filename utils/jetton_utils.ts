import { Address, Cell, beginCell } from '@ton/core';

export function createJettonTransferMessage(params: {
    queryId: bigint;
    amount: bigint;
    destination: Address;
    responseDestination?: Address;
    customPayload?: Cell;
    forwardTonAmount: bigint;
    forwardPayload?: Cell;
}) {
    const builder = beginCell();
    const op_transfer = 0xf8a7ea5;

    builder.storeUint(op_transfer, 32);
    builder.storeUint(params.queryId, 64);
    builder.storeCoins(BigInt(params.amount));
    builder.storeAddress(params.destination);
    builder.storeAddress(params.responseDestination);

    if (params.customPayload) {
        builder.storeBit(true);
        builder.storeRef(params.customPayload);
    } else {
        builder.storeBit(false);
    }

    builder.storeCoins(BigInt(params.forwardTonAmount));

    if (params.forwardPayload) {
        builder.storeBit(true);
        builder.storeRef(params.forwardPayload);
    } else {
        builder.storeBit(false);
    }

    return builder.endCell();
}
