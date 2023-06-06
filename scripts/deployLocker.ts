import {Cell, toNano} from 'ton-core';
import { Locker } from '../wrappers/Locker';
import { compile, NetworkProvider } from '@ton-community/blueprint';

export async function run(provider: NetworkProvider) {
    const locker = provider.open(
        Locker.createFromConfig(
            {
                depositsEndTime: 10,
                vestingStartTime: 100,
                vestingTotalDuration: 1000,
                unlockPeriod: 100,
                billCode: Cell.fromBoc(Buffer.from('b5ee9c724101070100f0000114ff00f4a413f4bcf2c80b0102016203020009a19c05e00f0202cd05040019f76a2687d207d007d20698fe8c017fd76d176fd99e8698180b8d8492f81f001698f81fd20187803a9a1e382936000ce1a9a9a81797028027d0068d071872ce42802678b2c7d0100e78b658fe4f6aa40600fc06c000f2bd07d307d120c07701c06566b1f2be5141c705048e28345b6c22f2e05282103b9aca0072fb02801801707003c8cb0558cf1601fa02cb6ac98306fb00db31e05143b1f2e051029a0382103b9aca00bef2bc9133e272801824707003c8cb0558cf1601fa02cb6acb1f22cf1621fa0214cb1fc98040fb0058f823017ee09b3f', 'hex'))[0]
            },
            await compile('Locker')
        )
    );

    await locker.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(locker.address);

    console.log('data', await locker.getData());
}
