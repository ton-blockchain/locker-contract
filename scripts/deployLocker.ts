import {Cell, toNano} from 'ton-core';
import { Locker } from '../wrappers/Locker';
import { compile, NetworkProvider } from '@ton-community/blueprint';

export async function run(provider: NetworkProvider) {
    const lockerBillCode: Cell = await compile('LockerBill');

    const locker = provider.open(
        Locker.createFromConfig(
            {
                depositsEndTime: 10,
                vestingStartTime: 100,
                vestingTotalDuration: 1000,
                unlockPeriod: 100,
                billCode: lockerBillCode
            },
            await compile('Locker')
        )
    );

    await locker.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(locker.address);

    console.log('data', await locker.getData());
}
