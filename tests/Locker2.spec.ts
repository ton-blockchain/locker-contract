import {Blockchain, SandboxContract, TreasuryContract} from '@ton-community/sandbox';
import {beginCell, Cell, toNano} from 'ton-core';
import {ErrorCodes, Locker, Opcodes} from '../wrappers/Locker';
import '@ton-community/test-utils';
import {compile} from '@ton-community/blueprint';
import {TransactionDescriptionGeneric} from "ton-core/src/types/TransactionDescription";
import {TransactionComputeVm} from "ton-core/src/types/TransactionComputePhase";
import {LockerBill} from "../wrappers/LockerBill";


const START_TIME = 1690243200; // 25 july 2023 00:00:00 UTC
const DAY = 60 * 60 * 24;
const DEPOSITS_DURATION = DAY * 30 * 3; // 90 days
const LOCK_DURATION = DAY * 30 * 12 * 2; // 2 years
const DEPOSITS_END_TIME = START_TIME + DEPOSITS_DURATION;
const VESTING_START_TIME = START_TIME + DEPOSITS_DURATION + LOCK_DURATION;
const VESTING_DURATION = DAY * 30 * 12 * 3; // 3 years
const UNLOCK_PERIOD = DAY * 30; // 1 month

const TIME = START_TIME;

describe('Locker', () => {
    let code: Cell;
    let lockerBillCode: Cell

    beforeAll(async () => {
        code = await compile('Locker');
        lockerBillCode = await compile('LockerBill');
    });

    let blockchain: Blockchain;
    let locker: SandboxContract<Locker>;
    let locker2: SandboxContract<Locker>;
    let lockerBill: SandboxContract<LockerBill>;
    let user: SandboxContract<TreasuryContract>;
    let notUser: SandboxContract<TreasuryContract>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        blockchain.now = TIME;

        user = await blockchain.treasury('user', {balance: toNano('11000000000')});
        notUser = await blockchain.treasury('notUser', {balance: toNano('11000000000')});

        locker = blockchain.openContract(
            Locker.createFromConfig(
                {
                    depositsEndTime: DEPOSITS_END_TIME,
                    vestingStartTime: VESTING_START_TIME,
                    vestingTotalDuration: VESTING_DURATION,
                    unlockPeriod: UNLOCK_PERIOD,
                    billCode: lockerBillCode
                },
                code
            )
        );

        lockerBill = blockchain.openContract(
            LockerBill.createFromConfig(
                {
                    lockerAddress: locker.address,
                    userAddress: user.address,
                },
                lockerBillCode
            )
        );

        const deployer = await blockchain.treasury('deployer');

        const deployResult = await locker.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: locker.address,
            deploy: true,
            success: false, // 
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and locker are ready to use
    });

    it('get methods', async () => {
        const data = await locker.getData();
        expect(data.totalCoinsLocked).toBe(0n);
        expect(data.totalReward).toBe(0n);
        expect(data.depositsEndTime).toBe(DEPOSITS_END_TIME);
        expect(data.vestingStartTime).toBe(VESTING_START_TIME);
        expect(data.vestingTotalDuration).toBe(VESTING_DURATION);
        expect(data.unlockPeriod).toBe(UNLOCK_PERIOD);
    });

    it('get_bill_address', async () => {
        const data = await locker.getBillAddress(user.address);
        expect(data.toString()).toBe(lockerBill.address.toString());
    });


    it('ignore bounced message', async () => {
        // todo
    });

    it('bounce empty message', async () => {
        const result = await locker.sendEmpty(user.getSender(), {
            value: toNano('1'),
        });
        expect((result.transactions[1].description as TransactionDescriptionGeneric).aborted).toBeTruthy();
        expect(((result.transactions[1].description as TransactionDescriptionGeneric).computePhase as TransactionComputeVm).exitCode).toBe(9); // Cell underflow
    });

    it('bounce unsupported op', async () => {
        const result = await locker.sendInvalidOp(user.getSender(), {
            value: toNano('1'),
        });
        expect((result.transactions[1].description as TransactionDescriptionGeneric).aborted).toBeTruthy();
        expect(((result.transactions[1].description as TransactionDescriptionGeneric).computePhase as TransactionComputeVm).exitCode).toBe(ErrorCodes.only_text_comments_supported);
    });

    it('bounce unsupported message', async () => {
        const result = await locker.sendChar(user.getSender(), {
            value: toNano('1'),
            char: "a"
        });
        expect((result.transactions[1].description as TransactionDescriptionGeneric).aborted).toBeTruthy();
        expect(((result.transactions[1].description as TransactionDescriptionGeneric).computePhase as TransactionComputeVm).exitCode).toBe(ErrorCodes.invalid_comment);
    });

    it('bounce unsupported message length', async () => {
        const result = await locker.sendChar(user.getSender(), {
            value: toNano('1'),
            char: "aaa"
        });
        expect((result.transactions[1].description as TransactionDescriptionGeneric).aborted).toBeTruthy();
        expect(((result.transactions[1].description as TransactionDescriptionGeneric).computePhase as TransactionComputeVm).exitCode).toBe(ErrorCodes.invalid_comment_length);
    });

    it('bounce little reward from user', async () => {
        const result = await locker.sendChar(user.getSender(), {
            value: toNano('2'),
            char: "r"
        });
        expect((result.transactions[1].description as TransactionDescriptionGeneric).aborted).toBeTruthy();
        expect(((result.transactions[1].description as TransactionDescriptionGeneric).computePhase as TransactionComputeVm).exitCode).toBe(ErrorCodes.not_enough_coins_for_reward);
    });

    it('bounce late reward from user', async () => {
        blockchain.now = TIME + DEPOSITS_DURATION + 1;
        const result = await locker.sendChar(user.getSender(), {
            value: toNano('1000000'),
            char: "r"
        });
        expect((result.transactions[1].description as TransactionDescriptionGeneric).aborted).toBeTruthy();
        expect(((result.transactions[1].description as TransactionDescriptionGeneric).computePhase as TransactionComputeVm).exitCode).toBe(ErrorCodes.deposits_time_ended);
    });

    it('accept reward from user', async () => {
        const result = await locker.sendChar(user.getSender(), {
            value: toNano('50'),
            char: 'r'
        });
        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: locker.address,
            success: true,
        });

        const data = await locker.getData();
        expect(data.totalCoinsLocked).toBe(0n);
        expect(data.totalReward).toBe(toNano('49'));
        expect(data.depositsEndTime).toBe(DEPOSITS_END_TIME);
        expect(data.vestingStartTime).toBe(VESTING_START_TIME);
        expect(data.vestingTotalDuration).toBe(VESTING_DURATION);
        expect(data.unlockPeriod).toBe(UNLOCK_PERIOD);
    });

    it('accept twice reward from user', async () => {
        const result = await locker.sendChar(user.getSender(), {
            value: toNano('100000000'),
            char: 'r'
        });
        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: locker.address,
            success: true,
        });

        const data = await locker.getData();
        expect(data.totalCoinsLocked).toBe(0n);
        expect(data.totalReward).toBe(toNano('99999999'));
        expect(data.depositsEndTime).toBe(DEPOSITS_END_TIME);
        expect(data.vestingStartTime).toBe(VESTING_START_TIME);
        expect(data.vestingTotalDuration).toBe(VESTING_DURATION);
        expect(data.unlockPeriod).toBe(UNLOCK_PERIOD);

        const result2 = await locker.sendChar(user.getSender(), {
            value: toNano('200000000'),
            char: 'r'
        });
        expect(result2.transactions).toHaveTransaction({
            from: user.address,
            to: locker.address,
            success: true,
        });

        const data2 = await locker.getData();
        expect(data2.totalCoinsLocked).toBe(0n);
        expect(data2.totalReward).toBe(toNano('299999998'));
        expect(data2.depositsEndTime).toBe(DEPOSITS_END_TIME);
        expect(data2.vestingStartTime).toBe(VESTING_START_TIME);
        expect(data2.vestingTotalDuration).toBe(VESTING_DURATION);
        expect(data2.unlockPeriod).toBe(UNLOCK_PERIOD);
    });

    it('bounce little deposit from user', async () => {
        const result = await locker.sendChar(user.getSender(), {
            value: toNano('2'),
            char: "d"
        });
        expect((result.transactions[1].description as TransactionDescriptionGeneric).aborted).toBeTruthy();
        expect(((result.transactions[1].description as TransactionDescriptionGeneric).computePhase as TransactionComputeVm).exitCode).toBe(ErrorCodes.not_enough_coins_for_deposit);
    });

    it('bounce late deposit from user', async () => {
        blockchain.now = TIME + DEPOSITS_DURATION + 1;
        const result = await locker.sendChar(user.getSender(), {
            value: toNano('1000000'),
            char: "d"
        });
        expect((result.transactions[1].description as TransactionDescriptionGeneric).aborted).toBeTruthy();
        expect(((result.transactions[1].description as TransactionDescriptionGeneric).computePhase as TransactionComputeVm).exitCode).toBe(ErrorCodes.deposits_time_ended);
    });

    it('accept 5B reward and 5B deposit from user', async () => {
        const result = await locker.sendChar(user.getSender(), {
            value: toNano('5000000000'),
            char: 'r'
        });
        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: locker.address,
            success: true,
        });

        const data = await locker.getData();
        expect(data.totalCoinsLocked).toBe(0n);
        expect(data.totalReward).toBe(toNano('4999999999'));
        expect(data.depositsEndTime).toBe(DEPOSITS_END_TIME);
        expect(data.vestingStartTime).toBe(VESTING_START_TIME);
        expect(data.vestingTotalDuration).toBe(VESTING_DURATION);
        expect(data.unlockPeriod).toBe(UNLOCK_PERIOD);

        const result2 = await locker.sendChar(user.getSender(), {
            value: toNano('5000000000'),
            char: 'd'
        });
        expect(result2.transactions).toHaveTransaction({
            from: user.address,
            to: locker.address,
            success: true,
        });

        const data2 = await locker.getData();
        expect(data2.totalCoinsLocked).toBe(toNano('4999999999'));
        expect(data2.totalReward).toBe(toNano('4999999999'));
        expect(data2.depositsEndTime).toBe(DEPOSITS_END_TIME);
        expect(data2.vestingStartTime).toBe(VESTING_START_TIME);
        expect(data2.vestingTotalDuration).toBe(VESTING_DURATION);
        expect(data2.unlockPeriod).toBe(UNLOCK_PERIOD);

        expect(result2.transactions).toHaveTransaction({
            from: locker.address,
            to: lockerBill.address,
            success: true,
            body: beginCell().storeUint(Opcodes.deposit_to_bill, 32).storeCoins(toNano('4999999999')).endCell()
        });
    });

    it('accept deposit from user', async () => {
        const result = await locker.sendChar(user.getSender(), {
            value: toNano('50'),
            char: 'd'
        });
        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: locker.address,
            success: true,
        });

        const data = await locker.getData();
        expect(data.totalCoinsLocked).toBe(toNano('49'));
        expect(data.totalReward).toBe(0n);
        expect(data.depositsEndTime).toBe(DEPOSITS_END_TIME);
        expect(data.vestingStartTime).toBe(VESTING_START_TIME);
        expect(data.vestingTotalDuration).toBe(VESTING_DURATION);
        expect(data.unlockPeriod).toBe(UNLOCK_PERIOD);

        expect(result.transactions).toHaveTransaction({
            from: locker.address,
            to: lockerBill.address,
            success: true,
            body: beginCell().storeUint(Opcodes.deposit_to_bill, 32).storeCoins(toNano('49')).endCell()
        });

        const billData = await lockerBill.getData();
        expect(billData.lockerAddress.toString()).toBe(locker.address.toString());
        expect(billData.totalCoinsDeposit).toBe(toNano('49'));
        expect(billData.userAddress.toString()).toBe(user.address.toString());
        expect(billData.lastWithdrawTime).toBe(0);

        // second deposit

        blockchain.now = TIME + 1;

        const result2 = await locker.sendChar(user.getSender(), {
            value: toNano('50'),
            char: 'd'
        });
        expect(result2.transactions).toHaveTransaction({
            from: user.address,
            to: locker.address,
            success: true,
        });

        const data2 = await locker.getData();
        expect(data2.totalCoinsLocked).toBe(toNano('98'));
        expect(data2.totalReward).toBe(0n);
        expect(data2.depositsEndTime).toBe(DEPOSITS_END_TIME);
        expect(data2.vestingStartTime).toBe(VESTING_START_TIME);
        expect(data2.vestingTotalDuration).toBe(VESTING_DURATION);
        expect(data2.unlockPeriod).toBe(UNLOCK_PERIOD);

        expect(result2.transactions).toHaveTransaction({
            from: locker.address,
            to: lockerBill.address,
            success: true,
            body: beginCell().storeUint(Opcodes.deposit_to_bill, 32).storeCoins(toNano('49')).endCell()
        });

        const billData2 = await lockerBill.getData();
        expect(billData2.lockerAddress.toString()).toBe(locker.address.toString());
        expect(billData2.totalCoinsDeposit).toBe(toNano('98'));
        expect(billData2.userAddress.toString()).toBe(user.address.toString());
        expect(billData2.lastWithdrawTime).toBe(0);

        //  withdraw

        blockchain.now = VESTING_START_TIME + UNLOCK_PERIOD + 1;

        const result3 = await locker.sendChar(user.getSender(), {
            value: toNano('1'),
            char: 'w'
        });
        expect(result3.transactions).toHaveTransaction({
            from: user.address,
            to: locker.address,
            success: true,
        });

        const data3 = await locker.getData();
        expect(data3.totalCoinsLocked).toBe(toNano('98'));
        expect(data3.totalReward).toBe(0n);
        expect(data3.depositsEndTime).toBe(DEPOSITS_END_TIME);
        expect(data3.vestingStartTime).toBe(VESTING_START_TIME);
        expect(data3.vestingTotalDuration).toBe(VESTING_DURATION);
        expect(data3.unlockPeriod).toBe(UNLOCK_PERIOD);

        expect(result3.transactions).toHaveTransaction({
            from: locker.address,
            to: lockerBill.address,
            success: true,
            body: beginCell().storeUint(0, 32).storeUint('w'.charCodeAt(0), 8).endCell()
        });

        const billData3 = await lockerBill.getData();
        expect(billData3.lockerAddress.toString()).toBe(locker.address.toString());
        expect(billData3.totalCoinsDeposit).toBe(toNano('98'));
        expect(billData3.userAddress.toString()).toBe(user.address.toString());
        expect(billData3.lastWithdrawTime).toBe(VESTING_START_TIME + UNLOCK_PERIOD + 1);

        expect(result3.transactions).toHaveTransaction({
            from: lockerBill.address,
            to: locker.address,
            success: true,
            body: beginCell()
                .storeUint(Opcodes.withdraw_from_bill, 32)
                .storeAddress(user.address)
                .storeCoins(toNano('98')) // total deposit
                .storeUint(0, 32) // last withdrawal
                .storeUint(VESTING_START_TIME + UNLOCK_PERIOD + 1, 32) // now_time
                .endCell()
        });

        expect(result3.transactions).toHaveTransaction({
            from: locker.address,
            to: user.address,
            // value: 10779005000n,
            success: true,
            body: beginCell()
                .endCell()
        });

    });

    it('reject withdraw_from_bill from user', async () => {
        const result = await locker.sendWithdrawFromBill(user.getSender(), {
            value: toNano('1'),
            userAddress: user.address,
            totalUserDeposit: toNano('98'),
            lastWithdrawTime: 0
        });
        expect((result.transactions[1].description as TransactionDescriptionGeneric).aborted).toBeTruthy();
        expect(((result.transactions[1].description as TransactionDescriptionGeneric).computePhase as TransactionComputeVm).exitCode).toBe(ErrorCodes.invalid_bill_sender);
    });

    it('reject withdraw from user with 0.5 ton', async () => {
        blockchain.now = VESTING_START_TIME + UNLOCK_PERIOD + 1;

        const result = await locker.sendChar(user.getSender(), {
            value: toNano('0.5'),
            char: 'w'
        });

        expect((result.transactions[1].description as TransactionDescriptionGeneric).aborted).toBeTruthy();
        expect(((result.transactions[1].description as TransactionDescriptionGeneric).computePhase as TransactionComputeVm).exitCode).toBe(ErrorCodes.msg_value_at_least_one_ton);
    });

    it('reject early withdraw from user with', async () => {
        blockchain.now = TIME + 101;

        const result = await locker.sendChar(user.getSender(), {
            value: toNano('1'),
            char: 'w'
        });

        expect((result.transactions[1].description as TransactionDescriptionGeneric).aborted).toBeTruthy();
        expect(((result.transactions[1].description as TransactionDescriptionGeneric).computePhase as TransactionComputeVm).exitCode).toBe(ErrorCodes.withdraw_time_not_started);
    });

    it('get_unlocked_amount', async () => {
        expect(await locker.getUnlockedAmount(0, 10000n)).toBe(0n);
        expect(await locker.getUnlockedAmount(TIME + 100, 36000n)).toBe(0n);
        expect(await locker.getUnlockedAmount(TIME + 1000, 36000n)).toBe(0n);
        expect(await locker.getUnlockedAmount(TIME + 1059, 36000n)).toBe(0n);
        expect(await locker.getUnlockedAmount(VESTING_START_TIME + UNLOCK_PERIOD, 36000n)).toBe(1000n);
        expect(await locker.getUnlockedAmount(VESTING_START_TIME + UNLOCK_PERIOD + 1, 36000n)).toBe(1000n);
        expect(await locker.getUnlockedAmount(VESTING_START_TIME + UNLOCK_PERIOD * 2 - 1, 36000n)).toBe(1000n);
        expect(await locker.getUnlockedAmount(VESTING_START_TIME + UNLOCK_PERIOD * 2, 36000n)).toBe(2000n);
        expect(await locker.getUnlockedAmount(VESTING_START_TIME + UNLOCK_PERIOD * 4 -1, 36000n)).toBe(3000n);
        expect(await locker.getUnlockedAmount(VESTING_START_TIME + UNLOCK_PERIOD * 4, 36000n)).toBe(4000n);
        expect(await locker.getUnlockedAmount(VESTING_START_TIME + UNLOCK_PERIOD * 10 -1, 36000n)).toBe(9000n);
        expect(await locker.getUnlockedAmount(VESTING_START_TIME + UNLOCK_PERIOD * 10, 36000n)).toBe(10000n);
        expect(await locker.getUnlockedAmount(VESTING_START_TIME + VESTING_DURATION, 36000n)).toBe(36000n);
    });

    it('get_amount_to_withdraw', async () => {
        const locker2 = blockchain.openContract(
            Locker.createFromConfig(
                {
                    totalCoinsLocked: 10000n,
                    totalReward: 0n,
                    depositsEndTime: DEPOSITS_END_TIME,
                    vestingStartTime: VESTING_START_TIME,
                    vestingTotalDuration: VESTING_DURATION,
                    unlockPeriod: UNLOCK_PERIOD,
                    billCode: lockerBillCode
                },
                code
            )
        );
        const deployer2 = await blockchain.treasury('deployer2');
        await locker2.sendDeploy(deployer2.getSender(), toNano('0.05'));

        // zero total_user_deposit

        expect(await locker2.getAmountToWithdraw(TIME, 0, 0n)).toBe(0n);
        expect(await locker2.getAmountToWithdraw(VESTING_START_TIME + UNLOCK_PERIOD, 0, 0n)).toBe(0n);
        expect(await locker2.getAmountToWithdraw(VESTING_START_TIME + UNLOCK_PERIOD * 2, 0, 0n)).toBe(0n);
        expect(await locker2.getAmountToWithdraw(VESTING_START_TIME + VESTING_DURATION, 0, 0n)).toBe(0n);

        // total_user_deposit

        expect(await locker2.getAmountToWithdraw(TIME, 0, 10000n)).toBe(0n);
        expect(await locker2.getAmountToWithdraw(VESTING_START_TIME + UNLOCK_PERIOD, 0, 36000n)).toBe(1000n);
        expect(await locker2.getAmountToWithdraw(VESTING_START_TIME + UNLOCK_PERIOD * 2, 0, 36000n)).toBe(2000n);
        expect(await locker2.getAmountToWithdraw(VESTING_START_TIME + VESTING_DURATION, 0, 36000n)).toBe(36000n);

        expect(await locker2.getAmountToWithdraw(VESTING_START_TIME + VESTING_DURATION * 2, VESTING_START_TIME + UNLOCK_PERIOD * 2, 36000n)).toBe(34000n);

        expect(await locker2.getAmountToWithdraw(TIME, 0, 10000n)).toBe(0n);
        expect(await locker2.getAmountToWithdraw(VESTING_START_TIME + UNLOCK_PERIOD, 0, 10000n)).toBe(277n);
        expect(await locker2.getAmountToWithdraw(VESTING_START_TIME + UNLOCK_PERIOD * 2, 0, 10000n)).toBe(555n);
        expect(await locker2.getAmountToWithdraw(VESTING_START_TIME + VESTING_DURATION, 0, 10000n)).toBe(10000n);

        // // reward

        const locker3 = blockchain.openContract(
            Locker.createFromConfig(
                {
                    totalCoinsLocked: 36000n,
                    totalReward: 500n,
                    depositsEndTime: DEPOSITS_END_TIME,
                    vestingStartTime: VESTING_START_TIME,
                    vestingTotalDuration: VESTING_DURATION,
                    unlockPeriod: UNLOCK_PERIOD,
                    billCode: lockerBillCode
                },
                code
            )
        );
        const deployer3 = await blockchain.treasury('deployer3');
        await locker3.sendDeploy(deployer2.getSender(), toNano('0.05'));

        // zero total_user_deposit

        expect(await locker3.getAmountToWithdraw(TIME, 0, 0n)).toBe(0n);
        expect(await locker3.getAmountToWithdraw(VESTING_START_TIME + UNLOCK_PERIOD, 0, 0n)).toBe(0n);
        expect(await locker3.getAmountToWithdraw(VESTING_START_TIME + UNLOCK_PERIOD * 2, 0, 0n)).toBe(0n);
        expect(await locker3.getAmountToWithdraw(VESTING_START_TIME + VESTING_DURATION, 0, 0n)).toBe(0n);
        //
        // // total_user_deposit

        expect(await locker3.getAmountToWithdraw(TIME, 0, 36000n)).toBe(0n);
        expect(await locker3.getAmountToWithdraw(VESTING_START_TIME + UNLOCK_PERIOD, 0, 36000n)).toBe(1000n + 500n/36n);
        expect(await locker3.getAmountToWithdraw(VESTING_START_TIME + UNLOCK_PERIOD * 2, 0, 36000n)).toBe(2000n + 500n*2n/36n);
        expect(await locker3.getAmountToWithdraw(VESTING_START_TIME + VESTING_DURATION, 0, 36000n)).toBe(36000n + 500n);

        // console.log('QQQ', await locker3.getAmountToWithdraw(VESTING_START_TIME + VESTING_DURATION * 10, VESTING_START_TIME + UNLOCK_PERIOD * 2, 36000n));
        // console.log('ZZZ', 34000n + 500n*34n/36n);
        // expect(await locker3.getAmountToWithdraw(VESTING_START_TIME + VESTING_DURATION * 10, VESTING_START_TIME + UNLOCK_PERIOD * 2, 36000n)).toBe(34000n + 500n*34n/36n);
        //
        // expect(await locker3.getAmountToWithdraw(TIME, 0, 4000n)).toBe(0n);
        // expect(await locker3.getAmountToWithdraw(TIME + 1060, 0, 4000n)).toBe(400n + 500n*4n/10n*1n/10n);
        // expect(await locker3.getAmountToWithdraw(TIME + 1120, 0, 4000n)).toBe(800n + 500n*4n/10n*2n/10n);
        // expect(await locker3.getAmountToWithdraw(TIME + 1000000, 0, 4000n)).toBe(4000n + 500n*4n/10n);

        expect(await locker3.getAmountToWithdraw(VESTING_START_TIME + VESTING_DURATION, 0, 0n)).toBe(0n);

    });

    it('withdraw_from_bill with 0 total_user_deposit', async () => {
        const locker2 = blockchain.openContract(
            Locker.createFromConfig(
                {
                    totalCoinsLocked: 10000n,
                    totalReward: 0n,
                    depositsEndTime: DEPOSITS_END_TIME,
                    vestingStartTime: VESTING_START_TIME,
                    vestingTotalDuration: VESTING_DURATION,
                    unlockPeriod: UNLOCK_PERIOD,
                    billCode: lockerBillCode
                },
                code
            )
        );
        const deployer2 = await blockchain.treasury('deployer2');
        await locker2.sendDeploy(deployer2.getSender(), toNano('0.05'));

        const lockerBill2 = blockchain.openContract(
            LockerBill.createFromConfig(
                {
                    lockerAddress: locker2.address,
                    userAddress: user.address,
                },
                lockerBillCode
            )
        );
        await lockerBill2.sendDeploy(deployer2.getSender(), toNano('0.05'));

        blockchain.now = VESTING_START_TIME + UNLOCK_PERIOD + 1;

        const result = await locker2.sendChar(user.getSender(), {
            value: toNano('1'),
            char: 'w'
        });
        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: locker2.address,
            success: true,
        });
        expect(result.transactions).toHaveTransaction({
            from: locker2.address,
            to: user.address,
            success: true,
            body: beginCell()
                .endCell()
        });

        const msg: any = result.transactions[result.transactions.length-1].inMessage;
        expect(msg.info.value.coins).toBeGreaterThan(toNano('0.9'));
        expect(msg.info.value.coins).toBeLessThan(toNano('1'));

    });

    it('withdraw_from_bill 30% and 100%', async () => {
        const result = await locker.sendChar(user.getSender(), {
            value: toNano('50'),
            char: 'd'
        });
        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: locker.address,
            success: true,
        });

        const data = await locker.getData();
        expect(data.totalCoinsLocked).toBe(toNano('49'));
        expect(data.totalReward).toBe(0n);
        expect(data.depositsEndTime).toBe(DEPOSITS_END_TIME);
        expect(data.vestingStartTime).toBe(VESTING_START_TIME);
        expect(data.vestingTotalDuration).toBe(VESTING_DURATION);
        expect(data.unlockPeriod).toBe(UNLOCK_PERIOD);

        expect(result.transactions).toHaveTransaction({
            from: locker.address,
            to: lockerBill.address,
            success: true,
            body: beginCell().storeUint(Opcodes.deposit_to_bill, 32).storeCoins(toNano('49')).endCell()
        });

        const billData = await lockerBill.getData();
        expect(billData.lockerAddress.toString()).toBe(locker.address.toString());
        expect(billData.totalCoinsDeposit).toBe(toNano('49'));
        expect(billData.userAddress.toString()).toBe(user.address.toString());
        expect(billData.lastWithdrawTime).toBe(0);

        // withdraw

        blockchain.now = VESTING_START_TIME + UNLOCK_PERIOD * 12 + 1;

        const result3 = await locker.sendChar(user.getSender(), {
            value: toNano('1'),
            char: 'w'
        });
        expect(result3.transactions).toHaveTransaction({
            from: user.address,
            to: locker.address,
            success: true,
        });

        const billData3 = await lockerBill.getData();
        expect(billData3.lockerAddress.toString()).toBe(locker.address.toString());
        expect(billData3.totalCoinsDeposit).toBe(toNano('49'));
        expect(billData3.userAddress.toString()).toBe(user.address.toString());
        expect(billData3.lastWithdrawTime).toBe(VESTING_START_TIME + UNLOCK_PERIOD * 12 + 1);

        expect(result3.transactions).toHaveTransaction({
            from: lockerBill.address,
            to: locker.address,
            success: true,
            body: beginCell()
                .storeUint(Opcodes.withdraw_from_bill, 32)
                .storeAddress(user.address)
                .storeCoins(toNano('49')) // total deposit
                .storeUint(0, 32) // last withdrawal
                .storeUint(VESTING_START_TIME + UNLOCK_PERIOD * 12 + 1, 32) // now_time
                .endCell()
        });

        expect(result3.transactions).toHaveTransaction({
            from: locker.address,
            to: user.address,
            success: true,
            value: 17312338333n,
            body: beginCell()
                .endCell()
        });

        // seconds withdraw

        blockchain.now = VESTING_START_TIME + UNLOCK_PERIOD * 36 + 1;

        const result4 = await locker.sendChar(user.getSender(), {
            value: toNano('1'),
            char: 'w'
        });
        expect(result4.transactions).toHaveTransaction({
            from: user.address,
            to: locker.address,
            success: true,
        });

        const billData4 = await lockerBill.getData();
        expect(billData4.lockerAddress.toString()).toBe(locker.address.toString());
        expect(billData4.totalCoinsDeposit).toBe(toNano('49'));
        expect(billData4.userAddress.toString()).toBe(user.address.toString());
        expect(billData4.lastWithdrawTime).toBe(VESTING_START_TIME + UNLOCK_PERIOD * 36 + 1);

        expect(result4.transactions).toHaveTransaction({
            from: lockerBill.address,
            to: locker.address,
            success: true,
            body: beginCell()
                .storeUint(Opcodes.withdraw_from_bill, 32)
                .storeAddress(user.address)
                .storeCoins(toNano('49')) // total deposit
                .storeUint(VESTING_START_TIME + UNLOCK_PERIOD * 12 + 1, 32) // last withdrawal
                .storeUint(VESTING_START_TIME + UNLOCK_PERIOD * 36 + 1, 32) // now_time
                .endCell()
        });

        expect(result4.transactions).toHaveTransaction({
            from: locker.address,
            to: user.address,
            success: true,
            value: 33645839667n,
            body: beginCell()
                .endCell()
        });

    });

    it('withdraw_from_bill 25% and 100% with REWARD', async () => {
        const result = await locker.sendChar(user.getSender(), {
            value: toNano('50'),
            char: 'd'
        });
        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: locker.address,
            success: true,
        });

        const resultD = await locker.sendChar(notUser.getSender(), {
            value: toNano('200'),
            char: 'd'
        });
        expect(resultD.transactions).toHaveTransaction({
            from: notUser.address,
            to: locker.address,
            success: true,
        });

        const result2 = await locker.sendChar(notUser.getSender(), {
            value: toNano('666'),
            char: 'r'
        });

        const data = await locker.getData();
        expect(data.totalCoinsLocked).toBe(toNano('49') + toNano('199'));
        expect(data.totalReward).toBe(toNano('665'));
        expect(data.depositsEndTime).toBe(DEPOSITS_END_TIME);
        expect(data.vestingStartTime).toBe(VESTING_START_TIME);
        expect(data.vestingTotalDuration).toBe(VESTING_DURATION);
        expect(data.unlockPeriod).toBe(UNLOCK_PERIOD);

        expect(result.transactions).toHaveTransaction({
            from: locker.address,
            to: lockerBill.address,
            success: true,
            body: beginCell().storeUint(Opcodes.deposit_to_bill, 32).storeCoins(toNano('49')).endCell()
        });

        const billData = await lockerBill.getData();
        expect(billData.lockerAddress.toString()).toBe(locker.address.toString());
        expect(billData.totalCoinsDeposit).toBe(toNano('49'));
        expect(billData.userAddress.toString()).toBe(user.address.toString());
        expect(billData.lastWithdrawTime).toBe(0);

        // withdraw

        blockchain.now = VESTING_START_TIME + UNLOCK_PERIOD * 9 + 1;

        const result3 = await locker.sendChar(user.getSender(), {
            value: toNano('1'),
            char: 'w'
        });
        expect(result3.transactions).toHaveTransaction({
            from: user.address,
            to: locker.address,
            success: true,
        });

        const billData3 = await lockerBill.getData();
        expect(billData3.lockerAddress.toString()).toBe(locker.address.toString());
        expect(billData3.totalCoinsDeposit).toBe(toNano('49'));
        expect(billData3.userAddress.toString()).toBe(user.address.toString());
        expect(billData3.lastWithdrawTime).toBe(VESTING_START_TIME + UNLOCK_PERIOD * 9 + 1);

        expect(result3.transactions).toHaveTransaction({
            from: lockerBill.address,
            to: locker.address,
            success: true,
            body: beginCell()
                .storeUint(Opcodes.withdraw_from_bill, 32)
                .storeAddress(user.address)
                .storeCoins(toNano('49')) // total deposit
                .storeUint(0, 32) // last withdrawal
                .storeUint(VESTING_START_TIME + UNLOCK_PERIOD * 9 + 1, 32) // now_time
                .endCell()
        });

        expect(result3.transactions).toHaveTransaction({
            from: locker.address,
            to: user.address,
            success: true,
            value: 46076787258n,
            body: beginCell()
                .endCell()
        });

        // seconds withdraw

        blockchain.now = VESTING_START_TIME + UNLOCK_PERIOD * 36 + 1;

        const result4 = await locker.sendChar(user.getSender(), {
            value: toNano('1'),
            char: 'w'
        });
        expect(result4.transactions).toHaveTransaction({
            from: user.address,
            to: locker.address,
            success: true,
        });

        const billData4 = await lockerBill.getData();
        expect(billData4.lockerAddress.toString()).toBe(locker.address.toString());
        expect(billData4.totalCoinsDeposit).toBe(toNano('49'));
        expect(billData4.userAddress.toString()).toBe(user.address.toString());
        expect(billData4.lastWithdrawTime).toBe(VESTING_START_TIME + UNLOCK_PERIOD * 36 + 1);

        expect(result4.transactions).toHaveTransaction({
            from: lockerBill.address,
            to: locker.address,
            success: true,
            body: beginCell()
                .storeUint(Opcodes.withdraw_from_bill, 32)
                .storeAddress(user.address)
                .storeCoins(toNano('49')) // total deposit
                .storeUint(VESTING_START_TIME + UNLOCK_PERIOD * 9 + 1, 32) // last withdrawal
                .storeUint(VESTING_START_TIME + UNLOCK_PERIOD * 36 + 1, 32) // now_time
                .endCell()
        });

        expect(result4.transactions).toHaveTransaction({
            from: locker.address,
            to: user.address,
            success: true,
            value: 136272519774n,
            body: beginCell()
                .endCell()
        });

    });

    it('withdraw_from_bill after vesting_start_period', async () => {
        const result = await locker.sendChar(user.getSender(), {
            value: toNano('50'),
            char: 'd'
        });
        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: locker.address,
            success: true,
        });

        const data = await locker.getData();
        expect(data.totalCoinsLocked).toBe(toNano('49'));
        expect(data.totalReward).toBe(0n);
        expect(data.depositsEndTime).toBe(DEPOSITS_END_TIME);
        expect(data.vestingStartTime).toBe(VESTING_START_TIME);
        expect(data.vestingTotalDuration).toBe(VESTING_DURATION);
        expect(data.unlockPeriod).toBe(UNLOCK_PERIOD);

        expect(result.transactions).toHaveTransaction({
            from: locker.address,
            to: lockerBill.address,
            success: true,
            body: beginCell().storeUint(Opcodes.deposit_to_bill, 32).storeCoins(toNano('49')).endCell()
        });

        const billData = await lockerBill.getData();
        expect(billData.lockerAddress.toString()).toBe(locker.address.toString());
        expect(billData.totalCoinsDeposit).toBe(toNano('49'));
        expect(billData.userAddress.toString()).toBe(user.address.toString());
        expect(billData.lastWithdrawTime).toBe(0);

        // withdraw

        blockchain.now = VESTING_START_TIME + VESTING_DURATION * 10;

        const result3 = await locker.sendChar(user.getSender(), {
            value: toNano('1'),
            char: 'w'
        });
        expect(result3.transactions).toHaveTransaction({
            from: user.address,
            to: locker.address,
            success: true,
        });

        const billData3 = await lockerBill.getData();
        expect(billData3.lockerAddress.toString()).toBe(locker.address.toString());
        expect(billData3.totalCoinsDeposit).toBe(toNano('49'));
        expect(billData3.userAddress.toString()).toBe(user.address.toString());
        expect(billData3.lastWithdrawTime).toBe(VESTING_START_TIME + VESTING_DURATION * 10);

        expect(result3.transactions).toHaveTransaction({
            from: lockerBill.address,
            to: locker.address,
            success: true,
            body: beginCell()
                .storeUint(Opcodes.withdraw_from_bill, 32)
                .storeAddress(user.address)
                .storeCoins(toNano('49')) // total deposit
                .storeUint(0, 32) // last withdrawal
                .storeUint(VESTING_START_TIME + VESTING_DURATION * 10, 32) // now_time
                .endCell()
        });

        expect(result3.transactions).toHaveTransaction({
            from: locker.address,
            to: user.address,
            success: true,
            value: 49979355000n,
            body: beginCell()
                .endCell()
        });

    });

});