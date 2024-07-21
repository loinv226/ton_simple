import { Cell, Dictionary, beginCell } from '@ton/core';
import fs from 'fs';
import path from 'path';

export function buildLibFromCell(build: Cell, output?: string | 'console'): Cell {
    const hex = build.hash().toString('hex');
    if (output === 'console') {
        console.log(`> PUBLIB: 0x${hex}`);
    } else if (typeof output === 'string') {
        fs.mkdirSync(path.dirname(output), { recursive: true });
        let filename = path.join(path.dirname(output), 'lib.' + path.basename(output));
        fs.writeFileSync(filename, JSON.stringify({ hex: `0x${hex}` }, null, 4), 'utf-8');
    }

    const lib = beginCell()
        .storeUint(2, 8)
        .storeUint(BigInt('0x' + hex), 256)
        .endCell();

    const libCell = new Cell({ exotic: true, bits: lib.bits, refs: lib.refs });

    return beginCell().storeBuffer(Buffer.from('FF0088D0ED1ED8', 'hex')).storeRef(libCell).endCell();
}

export function buildLibs(contracts: { [name: string]: Cell }) {
    const map = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell());
    // _libs.set(BigInt(`0x${_code.minter.hash().toString('hex')}`), _code.minter);
    // _libs.set(BigInt(`0x${_code.wallet.hash().toString('hex')}`), _code.wallet);
    // const libs = beginCell().storeDictDirect(_libs).endCell();

    for (let key in contracts) {
        let c = contracts[key];
        map.set(BigInt(`0x${c.hash().toString('hex')}`), c);
    }
    const libs = beginCell().storeDictDirect(map).endCell();
    return libs;
}

export function readLibHex(ctr: string) {
    return JSON.parse(fs.readFileSync(`build/lib.${ctr}.json`, 'utf8')).hex;
}
