import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    lang: 'func',
    targets: [
        // 'contracts/imports/stdlib.fc',
        // 'contracts/imports/types.fc',
        // 'contracts/imports/messages.fc',
        // 'contracts/imports/address.fc',
        // 'contracts/jetton/params.fc',
        // 'contracts/imports/jetton_utils.fc',
        // 'contracts/master/op.fc',
        // 'contracts/master/storage.fc',
        // 'contracts/master/errors.fc',
        // 'contracts/master/util.fc',
        'contracts/master.fc',
    ],
};
