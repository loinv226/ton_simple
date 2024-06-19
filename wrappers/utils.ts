import { Address, toNano, fromNano } from 'ton';
import { Cell, beginCell, Transaction } from 'ton-core';
import { JettonWallet } from './JettonWallet';
import { SandboxContract, TreasuryContract } from '@ton-community/sandbox';

export type ActiveWallet = SandboxContract<TreasuryContract>;
export type ActiveJettonWallet = SandboxContract<JettonWallet>;

export type sortBalanceResult = {
    min: ActiveJettonWallet;
    max: ActiveJettonWallet;
    maxBalance: bigint;
    minBalance: bigint;
    isEq: boolean;
    hasZero: boolean;
};

export type walletDesc = {
    user: ActiveWallet;
    jetton: ActiveJettonWallet;
    balance: bigint;
};

export const randomAddress = (wc: number = 0) => {
    const buf = Buffer.alloc(32);
    for (let i = 0; i < buf.length; i++) {
        buf[i] = Math.floor(Math.random() * 256);
    }
    return new Address(wc, buf);
};

export const differentAddress = (old: Address) => {
    let newAddress: Address;
    do {
        newAddress = randomAddress(old.workChain);
    } while (newAddress.equals(old));

    return newAddress;
};

export const getRandom = (min: number, max: number) => {
    return Math.random() * (max - min) + min;
};

enum roundMode {
    floor,
    ceil,
    round,
}

export const getRandomInt = (min: number, max: number, mode: roundMode = roundMode.floor) => {
    let res = getRandom(min, max);

    if (mode == roundMode.floor) {
        res = Math.floor(res);
    } else if (mode == roundMode.ceil) {
        res = Math.ceil(res);
    } else {
        res = Math.round(res);
    }

    return res;
};

export const getRandomTon = (min: number, max: number): bigint => {
    return toNano(getRandom(min, max).toFixed(9));
};

export const getRandomExp = (from: number = Math.floor(Date.now() / 1000)) => {
    return BigInt(from + getRandomInt(10, 12));
};

export const getRandomDuration = (max = 2592000) => {
    return getRandomInt(1, max);
};

export const renewExp = (cur: bigint) => {
    return Math.floor(Date.now() / 1000) >= cur ? getRandomExp(Number(cur)) : cur;
};

export const getRandomPayload = (): Cell => {
    return beginCell().storeCoins(getRandomTon(1, 2000)).endCell();
};

export const commonMsg = (op: bigint | number, query_id: bigint | number = 0) => {
    return beginCell().storeUint(op, 32).storeUint(query_id, 64).endCell();
};
