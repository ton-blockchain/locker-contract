# The Locker
Locker system consists of two contracts: Locker itself and locker-bill.

Locker stores all locked funds and reward. It's behavior is determined by four parameters: `deposits_end_time`, `vesting_start_time`, `vesting_total_duration` and `unlock_period`.

`deposit_end_time < vesting_start_time`, `vesting_total_duration > 0` and `mod( vesting_total_duration, unlock_period) == 0`.

Anybody can put reward to Locker contract before `deposit_end_time`. This reward is added to the reward pool.

Anybody can lock their funds on Locker contract before `deposit_end_time` to participate in reward distribution.

After `deposit_end_time` no deposits are allowed.

Reward is distributed among the lockers proportionally to their locked amount. For instance if total reward pool is 1000 TON, Alice locked 200 TON and Bob locked 300 TON, after full unlock Alice will get `200 + 1000 * 200/ (200 + 300) = 600` TON.

All funds are fully locked till `vesting_start_time`. After that funds will be step-wise released each `unlock_period` seconds.

For instance if `vesting_total_duration` is `31104000` seconds (1 year) and `unlock_period` is `2592000` (1 month) each month after `vesting_start_time` 1/12 of total reward will be released.

To deposit funds user need to send at least 50 TON to the locker address with comment `"d"`.

To withdraw released funds user need to send at least 1 TON to the locker address with comment `"w"`.


Locker-bill is used to store data about locks in sharding friendly way.


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

### Add a new contract

`npx blueprint create ContractName` or `yarn blueprint create ContractName`

# License
MIT
