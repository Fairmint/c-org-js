# c-org-js

A javascript library for interacting with the c-org contracts.

## c-org

This file helps to manage c-org contract deployments and upgrades. The `deploy` function brings it all together, given all the options for deploying and initializing the contracts it will complete all steps required to start interfacing with the new contract.

Each individual step is available independently as well. This allows you to maybe create a frontend that walks users through the process, as opposed to collect all information up front and then fire off many transactions.

## constants

Includes a few useful constant values, such as each of the states written as a string.

## corgContracts

This file helps to interface with an already deployed c-org contract.

`init` will read and store info into the `.data` structure that never changes (such as the buySlope).

`refreshOrgInfo` will store info into the `.data` structure that may change with future transactions (such as the totalSupply).

`refreshAccountInfo` takes a user's address and stores info into the `.data.account` that is specific to that user (such as the whitelisted jurisdictionId).

Each transaction that a user may broadcast is available as well. e.g. `Buy`.  When performing an action that will move tokens there is also an associated estimate*Value (such as estimateBuyValue to return the number of tokens the user should expect given the investment amount).

## gasRequirements

Includes constants for each transaction a user may perform, assigning an approx amount of gas required. These values aim to overestimate how much is required for the typical use case.

Eventually we would like to replace this with a dynamic solution (estimateGas) to support more use cases. e.g. if a user has a lot of individual token lockups then `sell` may fail because the recommended gas amount is not sufficient.

## networks

Primarily for testing, this file has web3 providers for common networks.

## Proxy

Offers a few methods for analyzing a proxy contract specifically, e.g. confirming the implementation address.

## uniswap

Offers an easy way to get the current value of a token from Uniswap, currently only `getEthToUSDC`.