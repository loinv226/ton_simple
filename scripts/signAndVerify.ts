import { NetworkProvider } from '@ton/blueprint';
import { keyPairFromSeed, getSecureRandomBytes, sign, signVerify, KeyPair } from '@ton/crypto';

export async function run(provider?: NetworkProvider, args?: string[]) {
    const data = Buffer.from('nonce');

    // Create Keypair
    const seed: Buffer = await getSecureRandomBytes(32);
    const keypair: KeyPair = keyPairFromSeed(seed);
    console.log('publicKey: ', keypair.publicKey.toString('hex'));
    // Sign
    const signature = sign(data, keypair.secretKey);
    console.log('signature: ', signature.toString('hex'));

    // Check
    const valid: boolean = signVerify(data, signature, keypair.publicKey);
    console.log('valid: ', valid);
}

run();
