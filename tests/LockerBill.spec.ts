import {Blockchain, SandboxContract, TreasuryContract} from '@ton-community/sandbox';
import {beginCell, Cell, toNano} from 'ton-core';
import {LockerBill} from '../wrappers/LockerBill';
import '@ton-community/test-utils';
import {compile} from '@ton-community/blueprint';
import {TransactionDescriptionGeneric} from "ton-core/src/types/TransactionDescription";
import {TransactionComputeVm} from "ton-core/src/types/TransactionComputePhase";
import {ErrorCodes, Opcodes} from "../wrappers/Locker";

const TIME = 1685889892;

describe('LockerBill', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('LockerBill');
    });

    let blockchain: Blockchain;
    let lockerBill: SandboxContract<LockerBill>;
    let user: SandboxContract<TreasuryContract>;
    let locker: SandboxContract<TreasuryContract>;
    let notUser: SandboxContract<TreasuryContract>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        blockchain.now = TIME;

        user = await blockchain.treasury('user', {balance: toNano('11000000000')}); // 11B
        locker = await blockchain.treasury('locker', {balance: toNano('11000000000')}); // 11B
        notUser = await blockchain.treasury('notUser', {balance: toNano('11000000000')}); // 11B

        lockerBill = blockchain.openContract(
            LockerBill.createFromConfig(
                {
                    lockerAddress: locker.address,
                    userAddress: user.address,
                },
                code
            )
        );

        const deployer = await blockchain.treasury('deployer');

        const deployResult = await lockerBill.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: lockerBill.address,
            deploy: true,
            success: false, // 
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and lockerBill are ready to use
    });

    it('get methods', async () => {
        const data = await lockerBill.getData();
        expect(data.lockerAddress.toString()).toBe(locker.address.toString());
        expect(data.totalCoinsDeposit).toBe(0n);
        expect(data.userAddress.toString()).toBe(user.address.toString());
        expect(data.lastWithdrawTime).toBe(0);
    });


    it('ignore bounced message', async () => {
        // todo
    });

    it('bounce empty message', async () => {
        const result = await lockerBill.sendEmpty(user.getSender(), {
            value: toNano('1'),
        });
        expect((result.transactions[1].description as TransactionDescriptionGeneric).aborted).toBeTruthy();
        expect(((result.transactions[1].description as TransactionDescriptionGeneric).computePhase as TransactionComputeVm).exitCode).toBe(9); // Cell underflow.
    });

    it('bounce unsupported op', async () => {
        const result = await lockerBill.sendInvalidOp(user.getSender(), {
            value: toNano('1'),
        });
        expect((result.transactions[1].description as TransactionDescriptionGeneric).aborted).toBeTruthy();
        expect(((result.transactions[1].description as TransactionDescriptionGeneric).computePhase as TransactionComputeVm).exitCode).toBe(ErrorCodes.only_text_comments_supported);
    });

    it('bounce unsupported message', async () => {
        const result = await lockerBill.sendChar(user.getSender(), {
            value: toNano('1'),
            char: "d"
        });
        expect((result.transactions[1].description as TransactionDescriptionGeneric).aborted).toBeTruthy();
        expect(((result.transactions[1].description as TransactionDescriptionGeneric).computePhase as TransactionComputeVm).exitCode).toBe(ErrorCodes.invalid_comment);
    });

    it('bounce unsupported message length', async () => {
        const result = await lockerBill.sendChar(user.getSender(), {
            value: toNano('1'),
            char: "aaa"
        });
        expect((result.transactions[1].description as TransactionDescriptionGeneric).aborted).toBeTruthy();
        expect(((result.transactions[1].description as TransactionDescriptionGeneric).computePhase as TransactionComputeVm).exitCode).toBe(ErrorCodes.invalid_comment_length);
    });

    it('bounce deposit from user', async () => {
        const result = await lockerBill.sendDepositFromLocker(user.getSender(), {
            value: toNano('0.5'),
            depositAmount: toNano('100')
        });
        expect((result.transactions[1].description as TransactionDescriptionGeneric).aborted).toBeTruthy();
        expect(((result.transactions[1].description as TransactionDescriptionGeneric).computePhase as TransactionComputeVm).exitCode).toBe(ErrorCodes.only_locker_address);
    });

    it('bounce deposit from notuser', async () => {
        const result = await lockerBill.sendDepositFromLocker(notUser.getSender(), {
            value: toNano('0.5'),
            depositAmount: toNano('100')
        });
        expect((result.transactions[1].description as TransactionDescriptionGeneric).aborted).toBeTruthy();
        expect(((result.transactions[1].description as TransactionDescriptionGeneric).computePhase as TransactionComputeVm).exitCode).toBe(ErrorCodes.only_locker_address);
    });

    it('deposit from locker', async () => {
        const result = await lockerBill.sendDepositFromLocker(locker.getSender(), {
            value: toNano('0.5'),
            depositAmount: toNano('50')
        });
        expect(result.transactions).toHaveTransaction({
            from: locker.address,
            to: lockerBill.address,
            success: true,
        });

        const data = await lockerBill.getData();
        expect(data.lockerAddress.toString()).toBe(locker.address.toString());
        expect(data.totalCoinsDeposit).toBe(toNano('50'));
        expect(data.userAddress.toString()).toBe(user.address.toString());
        expect(data.lastWithdrawTime).toBe(0);
    });

    it('deposit 5B from locker', async () => {
        const result = await lockerBill.sendDepositFromLocker(locker.getSender(), {
            value: toNano('0.5'),
            depositAmount: toNano('5000000000')
        });
        expect(result.transactions).toHaveTransaction({
            from: locker.address,
            to: lockerBill.address,
            success: true,
        });

        const data = await lockerBill.getData();
        expect(data.lockerAddress.toString()).toBe(locker.address.toString());
        expect(data.totalCoinsDeposit).toBe(toNano('5000000000'));
        expect(data.userAddress.toString()).toBe(user.address.toString());
        expect(data.lastWithdrawTime).toBe(0);
    });

    it('twice deposit  from locker', async () => {
        const result = await lockerBill.sendDepositFromLocker(locker.getSender(), {
            value: toNano('0.5'),
            depositAmount: toNano('1000000')
        });
        expect(result.transactions).toHaveTransaction({
            from: locker.address,
            to: lockerBill.address,
            success: true,
        });

        const data = await lockerBill.getData();
        expect(data.lockerAddress.toString()).toBe(locker.address.toString());
        expect(data.totalCoinsDeposit).toBe(toNano('1000000'));
        expect(data.userAddress.toString()).toBe(user.address.toString());
        expect(data.lastWithdrawTime).toBe(0);

        blockchain.now = TIME + 1;

        const result2 = await lockerBill.sendDepositFromLocker(locker.getSender(), {
            value: toNano('0.5'),
            depositAmount: toNano('11000000')
        });
        expect(result2.transactions).toHaveTransaction({
            from: locker.address,
            to: lockerBill.address,
            success: true,
        });

        const data2 = await lockerBill.getData();
        expect(data2.lockerAddress.toString()).toBe(locker.address.toString());
        expect(data2.totalCoinsDeposit).toBe(toNano('12000000'));
        expect(data2.userAddress.toString()).toBe(user.address.toString());
        expect(data2.lastWithdrawTime).toBe(0);
    });

    it('bounce withdraw from user with 0.5 ton', async () => {
        const result = await lockerBill.sendChar(user.getSender(), {
            value: toNano('0.5'),
            char: 'w',
        });
        expect((result.transactions[1].description as TransactionDescriptionGeneric).aborted).toBeTruthy();
        expect(((result.transactions[1].description as TransactionDescriptionGeneric).computePhase as TransactionComputeVm).exitCode).toBe(ErrorCodes.msg_value_at_least_one_ton);
    });

    it('withdraw from notuser', async () => {
        const result = await lockerBill.sendChar(notUser.getSender(), {
            value: toNano('1'),
            char: 'w',
        });
        expect((result.transactions[1].description as TransactionDescriptionGeneric).aborted).toBeTruthy();
        expect(((result.transactions[1].description as TransactionDescriptionGeneric).computePhase as TransactionComputeVm).exitCode).toBe(ErrorCodes.only_locker_or_user_address);
    });

    it('withdraw from user with 1 ton', async () => {
        const result = await lockerBill.sendChar(user.getSender(), {
            value: toNano('1'),
            char: 'w',
        });

        expect(result.transactions).toHaveTransaction({
            from: lockerBill.address,
            to: locker.address,
            success: true,
            body: beginCell()
                .storeUint(Opcodes.withdraw_from_bill, 32)
                .storeAddress(user.address)
                .storeCoins(0) // total deposit
                .storeUint(0, 32) // last withdrawal
                .endCell()
        });

        const data = await lockerBill.getData();
        expect(data.lockerAddress.toString()).toBe(locker.address.toString());
        expect(data.totalCoinsDeposit).toBe(toNano('0'));
        expect(data.userAddress.toString()).toBe(user.address.toString());
        expect(data.lastWithdrawTime).toBe(TIME);
    });

    it('withdraw amount from user with 1 ton', async () => {

        // deposit

        const result = await lockerBill.sendDepositFromLocker(locker.getSender(), {
            value: toNano('0.5'),
            depositAmount: toNano('1000000')
        });
        expect(result.transactions).toHaveTransaction({
            from: locker.address,
            to: lockerBill.address,
            success: true,
        });

        const data = await lockerBill.getData();
        expect(data.lockerAddress.toString()).toBe(locker.address.toString());
        expect(data.totalCoinsDeposit).toBe(toNano('1000000'));
        expect(data.userAddress.toString()).toBe(user.address.toString());
        expect(data.lastWithdrawTime).toBe(0);

        // withdraw

        blockchain.now = TIME + 1;

        const result2 = await lockerBill.sendChar(user.getSender(), {
            value: toNano('1'),
            char: 'w',
        });

        expect(result2.transactions).toHaveTransaction({
            from: lockerBill.address,
            to: locker.address,
            success: true,
            body: beginCell()
                .storeUint(Opcodes.withdraw_from_bill, 32)
                .storeAddress(user.address)
                .storeCoins(toNano('1000000')) // total deposit
                .storeUint(0, 32) // last withdrawal
                .endCell()
        });

        const data2 = await lockerBill.getData();
        expect(data2.lockerAddress.toString()).toBe(locker.address.toString());
        expect(data2.totalCoinsDeposit).toBe(toNano('1000000'));
        expect(data2.userAddress.toString()).toBe(user.address.toString());
        expect(data2.lastWithdrawTime).toBe(TIME + 1);

        // second withdraw

        blockchain.now = TIME + 100000;

        const result3 = await lockerBill.sendChar(user.getSender(), {
            value: toNano('1'),
            char: 'w',
        });

        expect(result3.transactions).toHaveTransaction({
            from: lockerBill.address,
            to: locker.address,
            success: true,
            body: beginCell()
                .storeUint(Opcodes.withdraw_from_bill, 32)
                .storeAddress(user.address)
                .storeCoins(toNano('1000000')) // total deposit
                .storeUint(TIME + 1, 32) // last withdrawal
                .endCell()
        });

        const data3 = await lockerBill.getData();
        expect(data3.lockerAddress.toString()).toBe(locker.address.toString());
        expect(data3.totalCoinsDeposit).toBe(toNano('1000000'));
        expect(data3.userAddress.toString()).toBe(user.address.toString());
        expect(data3.lastWithdrawTime).toBe(TIME + 100000);
    });

    it('withdraw from locker', async () => {
        const result = await lockerBill.sendChar(locker.getSender(), {
            value: toNano('0.9'),
            char: 'w',
        });

        expect(result.transactions).toHaveTransaction({
            from: lockerBill.address,
            to: locker.address,
            success: true,
            body: beginCell()
                .storeUint(Opcodes.withdraw_from_bill, 32)
                .storeAddress(user.address)
                .storeCoins(0) // total deposit
                .storeUint(0, 32) // last withdrawal
                .endCell()
        });

        const data = await lockerBill.getData();
        expect(data.lockerAddress.toString()).toBe(locker.address.toString());
        expect(data.totalCoinsDeposit).toBe(toNano('0'));
        expect(data.userAddress.toString()).toBe(user.address.toString());
        expect(data.lastWithdrawTime).toBe(TIME);
    });

    it('recover from notuser', async () => {
        const result = await lockerBill.sendChar(notUser.getSender(), {
            value: toNano('100'),
            char: 'e',
        });
        expect((result.transactions[1].description as TransactionDescriptionGeneric).aborted).toBeTruthy();
        expect(((result.transactions[1].description as TransactionDescriptionGeneric).computePhase as TransactionComputeVm).exitCode).toBe(ErrorCodes.only_user_address);
    });

    it('recover from locker', async () => {
        const result = await lockerBill.sendChar(locker.getSender(), {
            value: toNano('100'),
            char: 'e',
        });
        expect((result.transactions[1].description as TransactionDescriptionGeneric).aborted).toBeTruthy();
        expect(((result.transactions[1].description as TransactionDescriptionGeneric).computePhase as TransactionComputeVm).exitCode).toBe(ErrorCodes.only_user_address);
    });


    it('recover from user', async () => {
        await user.send({
            value: toNano('100'),
            to: lockerBill.address,
            bounce: false
        });

        const result = await lockerBill.sendChar(user.getSender(), {
            value: toNano('1'),
            char: 'e',
        });

        expect(result.transactions).toHaveTransaction({
            from: lockerBill.address,
            to: user.address,
            success: true,
            body: beginCell().endCell()
        });
        const outMsg: any = result.transactions[1].outMessages.get(0);
        expect(outMsg.info.value.coins).toBeGreaterThan(toNano('99'))
        expect(outMsg.info.value.coins).toBeLessThan(toNano('100'));

        const data = await lockerBill.getData();
        expect(data.lockerAddress.toString()).toBe(locker.address.toString());
        expect(data.totalCoinsDeposit).toBe(toNano('0'));
        expect(data.userAddress.toString()).toBe(user.address.toString());
        expect(data.lastWithdrawTime).toBe(0);
    });
});