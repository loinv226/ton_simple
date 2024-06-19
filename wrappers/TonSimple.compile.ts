import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    lang: 'func',
    targets: [
        'contracts/imports/stdlib.fc',
        'contracts/types.fc',
        'contracts/messages.fc',
        'contracts/address_calculations.fc',
        'contracts/ton_simple.fc',
        'contracts/jetton/op-codes.fc',
        'contracts/jetton/params.fc',
        'contracts/jetton/jetton-utils.fc',
        'contracts/ton_simple.fc',
    ],
};
