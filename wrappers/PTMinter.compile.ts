import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    lang: 'func',
    targets: ['contracts/pton/pton-contracts/contracts_build/minter.fc'],
};
