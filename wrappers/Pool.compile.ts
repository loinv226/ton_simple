import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    lang: 'func',
    targets: [
        // 'contracts/imports/stdlib.fc',
        // 'contracts/imports/types.fc',
        // 'contracts/imports/messages.fc',
        // 'contracts/imports/address.fc',
        // 'contracts/jetton/op-codes.fc',
        // 'contracts/jetton/params.fc',
        // 'contracts/jetton/jetton-utils.fc',
        // 'contracts/imports/op-codes.fc',
        'contracts/pool.fc',
    ],
};
