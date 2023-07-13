# The Locker

## Parameters

Get-method `get_locker_data` returns the smart contract parameters:

`total_coins_locked` - total amount of deposits from users in nanotons.

`total_reward` - total reward in nanotons.

`deposits_end_time` - unixtime, deposits and rewards are not accepted after this time.

`vesting_start_time` - unixtime, unlock of deposits starts after this time.

`vesting_total_duration` - total vesting duration in seconds (e.g. `31104000` for one year).

`unlock_period` - unlock period in seconds (e.g. `2592000` for once a month).

`deposits_end_time` must be less than `vesting_start_time`.

`vesting_total_duration` must be divisible by the `unlock_period` - `mod(vesting_total_duration, unlock_period) == 0`.

## Deposits

In order to make a deposit, you need to send at least 50 TON to the locker contract with a text comment "d" (lowercase letter).

Anyone can send.

A deposit minus 1 TON is credited (1 TON goes to network costs).

One user can send several times in this case the deposit is summed up.

> ⚠️ ATTENTION: Always send a message in BOUNCEABLE mode

If you send less than 50 TON or message without valid text comment, the amount will bounce.

If send after `deposits_end_time` the amount will bounce.

## Unlock and Rewards

The reward is accrued according to the amount of the user's deposit and the total amount of deposits.

If there are two users with a deposit of 100 TON and 1000 TON and a total reward of 500 TON, then after a complete unlock:

first user will receive = 100 + (100 * 500 / 1100) = 145 TON.

the second user will receive = 1000 + (1000 * 500 / 1100) = 1454 TON.

Until `vesting_start_time` deposits are blocked.

After `vesting_start_time` deposits start unlocking every `unlock_period`.

Full unlock date is `vesting_start_time` + `vesting_total_duration`.

## Withdrawals

In order to withdraw the current unlocked funds, you need to send 1 TON to the locker contract with a text comment "w" (lowercase letter) from the wallet from which the deposit was sent.

The amount unlocked at the moment will be sent to the user's wallet.

If the total amount of the user is 1000 TON (deposit + his part of the reward), and `vesting_total_duration` = 12 months, and `unlock_period` = 1 month, then

by sending a withdrawal request in the third month, the user will receive 1000 * 3 / 12 = 250 TON.

Then, by sending a withdrawal request in the 12th month, the user will receive 1000 - 250 = 750 TON.

## Smart Contracts

Locker system consists of two contracts: Locker itself and locker-bill.

Locker stores all locked funds and reward. It's behavior is determined by four immutable parameters: `deposits_end_time`, `vesting_start_time`, `vesting_total_duration` and `unlock_period` set during deployment.

Locker-bill is used to store data about locks in sharding friendly way.

When receiving a deposit, Locker creates auxiliary Locker-bill contract that store the user's address and his total deposit.

The user does not need to interact with auxiliary  Locker-bill smart contracts.

## Project structure

-   `contracts` - source code of all the smart contracts of the project and their dependencies.
-   `wrappers` - wrapper classes (implementing `Contract` from ton-core) for the contracts, including any [de]serialization primitives and compilation functions.
-   `tests` - tests for the contracts.
-   `scripts` - scripts used by the project, mainly the deployment scripts.

## How to use

### Build

`npx blueprint build` or `yarn blueprint build`

### Test

`npx blueprint test` or `yarn blueprint test`

### Deploy or run another script

`npx blueprint run` or `yarn blueprint run`

Send 1 TON for storage to Locker smart contract after deploy.

# License

MIT
