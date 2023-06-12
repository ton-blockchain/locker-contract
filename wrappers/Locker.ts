import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from 'ton-core';

export type LockerConfig = {
    totalCoinsLocked?: bigint
    totalReward?: bigint
    depositsEndTime: number;
    vestingStartTime: number;
    vestingTotalDuration: number;
    unlockPeriod: number;
    billCode: Cell;
};

export function lockerConfigToCell(config: LockerConfig): Cell {
    return beginCell()
        .storeCoins(config.totalCoinsLocked || 0n)
        .storeCoins(config.totalReward || 0n)
        .storeUint(config.depositsEndTime, 32)
        .storeUint(config.vestingStartTime, 32)
        .storeUint(config.vestingTotalDuration, 32)
        .storeUint(config.unlockPeriod, 32)
        .storeRef(config.billCode)
        .endCell();
}

export const Opcodes = {
    deposit_to_bill: 0x8ad026be,
    withdraw_from_bill: 0xd6416bfe,
};

export const ErrorCodes = {
    msg_value_at_least_one_ton: 60,
    only_text_comments_supported: 61,
    invalid_comment: 62,
    invalid_comment_length: 9,

    invalid_bill_sender: 71,
    deposits_time_ended: 72,
    withdraw_time_not_started: 73,
    not_enough_coins_for_deposit: 74,
    not_enough_coins_for_reward: 75,

    only_locker_address: 80,
    only_user_address: 82,
}

export class Locker implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new Locker(address);
    }

    static createFromConfig(config: LockerConfig, code: Cell, workchain = 0) {
        const data = lockerConfigToCell(config);
        const init = { code, data };
        return new Locker(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendEmpty(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .endCell(),
        });
    }


    async sendInvalidOp(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(1, 32) // text op
                .endCell(),
        });
    }

    async sendChar(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            char: string
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0, 32) // text op
                .storeStringTail(opts.char)
                .endCell(),
        });
    }

    async sendWithdrawFromBill(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            userAddress: Address,
            totalUserDeposit: bigint
            lastWithdrawTime: number;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.withdraw_from_bill, 32) // text op
                .storeAddress(opts.userAddress)
                .storeCoins(opts.totalUserDeposit)
                .storeUint(opts.lastWithdrawTime, 32)
                .endCell(),
        });
    }

    async getData(provider: ContractProvider) {
        const result = await provider.get('get_locker_data', []);
        return {
            totalCoinsLocked: result.stack.readBigNumber(),
            totalReward: result.stack.readBigNumber(),
            depositsEndTime: result.stack.readNumber(),
            vestingStartTime: result.stack.readNumber(),
            vestingTotalDuration: result.stack.readNumber(),
            unlockPeriod: result.stack.readNumber(),
        };
    }

    async getBillAddress(provider: ContractProvider, userAddress: Address) {
        const result = await provider.get('get_bill_address', [{type: 'slice', cell: beginCell().storeAddress(userAddress).endCell()}]);
        return result.stack.readAddress();
    }

    async getUnlockedAmount(provider: ContractProvider, nowTime: number, totalAmount: bigint) {
        const result = await provider.get('get_unlocked_amount', [{type: 'int', value: BigInt(nowTime)}, {type: 'int', value: totalAmount}]);
        return result.stack.readBigNumber();
    }

    async getAmountToWithdraw(provider: ContractProvider, nowTime: number, lastWithdrawTime: number, totalUserDeposit: bigint) {
        const result = await provider.get('get_amount_to_withdraw', [{type: 'int', value: BigInt(nowTime)},{type: 'int', value: BigInt(lastWithdrawTime)}, {type: 'int', value: totalUserDeposit}]);
        return result.stack.readBigNumber();
    }
}
