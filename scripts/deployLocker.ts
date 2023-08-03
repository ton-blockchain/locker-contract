import {Cell, toNano} from 'ton-core';
import { Locker } from '../wrappers/Locker';
import { compile, NetworkProvider } from '@ton-community/blueprint';

export async function run(provider: NetworkProvider) {
    const lockerBillCode: Cell = await compile('LockerBill');
    // deposits_end_time 1698019200 = 23 October 2023, 0:00:00 UTC
    // vesting_start_time 1760227200 = 12 October 2025, 0:00:00 UTC
    // vesting_total_duration = 93312000 seconds (~ 3 years)
    // unlock_period = 2592000 seconds (30 days)

    const START_TIME = 1690243200; // 25 july 2023 00:00:00 UTC
    const DAY = 60 * 60 * 24;
    const DEPOSITS_DURATION = DAY * 30 * 3; // 90 days
    const LOCK_DURATION = DAY * 30 * 12 * 2; // 2 years
    const VESTING_START_TIME = START_TIME + DEPOSITS_DURATION + LOCK_DURATION;
    const VESTING_DURATION = DAY * 30 * 12 * 3; // 3 years
    const UNLOCK_PERIOD = DAY * 30; // 1 month

    const locker = provider.open(
        Locker.createFromConfig(
            {
                depositsEndTime: START_TIME + DEPOSITS_DURATION,
                vestingStartTime: VESTING_START_TIME,
                vestingTotalDuration: VESTING_DURATION,
                unlockPeriod: UNLOCK_PERIOD,
                billCode: lockerBillCode
            },
            await compile('Locker')
        )
    );

    await locker.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(locker.address);

    console.log('data', await locker.getData());
}
