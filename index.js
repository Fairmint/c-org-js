const Web3 = require('web3');
const abi = require('c-org-abi/abi.json');
const BigNumber = require('bignumber.js');
const networks = require('./networks.js');
const constants = require('./constants');

module.exports = class Corg {
  async _getContractsFrom(network, oldWeb3, address) {
    try {
      let isNetworkMatch = false;
      let web3 = new Web3(networks[network].provider);
      try {
        const [networkId, newNetworkId] = await Promise.all([
          new Promise(((resolve) => {
            if (!oldWeb3) resolve(-1);
            oldWeb3.version.getNetwork(((e, networkId) => resolve(networkId)));
          })),
          web3.eth.net.getId(),
        ]);

        if (networkId.toString() === newNetworkId.toString()) {
          web3 = new Web3(oldWeb3.currentProvider);
          isNetworkMatch = true;
        }
      } catch (e) {
        console.log(e)
        // ignore
      }
      const networkName = networks[network].name;

      const datContract = new web3.eth.Contract(abi.dat, address);
      const currencyAddress = await datContract.methods.currencyAddress().call()
      const currency = currencyAddress ? new web3.eth.Contract(abi.erc20, currencyAddress) : null;
        const whitelist = new web3.eth.Contract(abi.whitelist, await datContract.methods.whitelistAddress().call());
        return {
          web3, isNetworkMatch, networkName, dat: datContract, currency, whitelist,
        };
      } catch (e) {
        console.log(e)
        // ignore
      }
  }

  async _getContracts(oldWeb3, address) {
    const promises = [];
    for (const network in networks) {
      promises.push(this._getContractsFrom(network, oldWeb3, address));
    }
    const results = await Promise.all(promises);
    for (const result of results) {
      if (result) {
        return result;
      }
    }

    return undefined; // address not found on any supported network
  }

  async getContracts(web3, address) {
    const contracts = await this._getContracts(web3, address);
    console.log(contracts)
    if (contracts) {
      {
        const [
          decimals,
          currencyDecimals,
          currencyName,
          currencySymbol,
          buySlopeNum,
          buySlopeDen,
          initGoal,
          initReserve,
          investmentReserve,
          revenueCommitment,
        ] = await Promise.all([
          contracts.fair.methods.decimals().call(),
          contracts.currency.methods.decimals().call(),
          contracts.currency ? contracts.currency.methods.name().call() : 'Ether',
          contracts.currency ? contracts.currency.methods.symbol().call() : 'ETH',
          contracts.dat.methods.buySlopeNum().call(),
          contracts.dat.methods.buySlopeDen().call(),
          contracts.dat.methods.initGoal().call(),
          contracts.dat.methods.initReserve().call(),
          contracts.dat.methods.investmentReserveBasisPoints().call(),
          contracts.dat.methods.revenueCommitmentBasisPoints().call(),
        ]);

        contracts.data = {
          decimals: parseInt(decimals),
          currency: {
            decimals: parseInt(currencyDecimals),
            name: currencyName,
            symbol: currencySymbol,
          },
        };
        contracts.data.buySlope = new BigNumber(buySlopeNum).div(buySlopeDen).shiftedBy(contracts.data.currency.decimals),
        contracts.data.initGoal = new BigNumber(initGoal).shiftedBy(-contracts.data.decimals),
        contracts.data.initReserve = new BigNumber(initReserve).shiftedBy(-contracts.data.decimals),
        contracts.data.investmentReserve = new BigNumber(investmentReserve).div(constants.BASIS_POINTS_DEN),
        contracts.data.revenueCommitment = new BigNumber(revenueCommitment).div(constants.BASIS_POINTS_DEN);
      }

      contracts.sendTx = async (tx) => new Promise((resolve) => {
        tx.send({
          from: contracts.data.account.address,
          gas: 500000, // todo estimate gas
          gasPrice: contracts.web3.utils.toWei('1.1', 'Gwei'),
        })
          .on('transactionHash', (tx) => {
            resolve(tx);
          });
      }),

      contracts.helpers = {
        refreshAccountInfo: async (account) => {
          contracts.data.account = { address: account };
          const [ethBalance, fairBalance, kycApproved, currencyBalance, allowance] = await Promise.all([
            contracts.web3.eth.getBalance(account),
            contracts.fair.methods.balanceOf(account).call(),
            contracts.erc1404.methods.approved(account).call(),
            contracts.currency ? contracts.currency.methods.balanceOf(account).call() : undefined,
            contracts.currency ? contracts.currency.methods.allowance(account, contracts.dat._address).call() : undefined,
          ]);
          contracts.data.account.ethBalance = new BigNumber(ethBalance).shiftedBy(-18);
          contracts.data.account.fairBalance = new BigNumber(fairBalance).shiftedBy(-contracts.data.decimals);
          contracts.data.account.kycApproved = kycApproved;
          if (currencyBalance) {
            contracts.data.account.currencyBalance = new BigNumber(currencyBalance).shiftedBy(-contracts.data.currency.decimals);
            contracts.data.account.allowance = new BigNumber(allowance).shiftedBy(-contracts.data.currency.decimals);
          }
        },
        refreshOrgInfo: async () => {
          const [
            totalSupply,
            burnedSupply,
            name,
            symbol,
            beneficiary,
            control,
            feeCollector,
            burnThreshold,
            buybackReserve,
            fee,
            minInvestment,
            openUntilAtLeast,
            stateId,
          ] = await Promise.all([
            contracts.fair.methods.totalSupply().call(),
            contracts.fair.methods.burnedSupply().call(),
            contracts.fair.methods.name().call(),
            contracts.fair.methods.symbol().call(),
            contracts.dat.methods.beneficiary().call(),
            contracts.dat.methods.control().call(),
            contracts.dat.methods.feeCollector().call(),
            contracts.dat.methods.burnThresholdBasisPoints().call(),
            contracts.dat.methods.buybackReserve().call(),
            contracts.dat.methods.feeBasisPoints().call(),
            contracts.dat.methods.minInvestment().call(),
            contracts.dat.methods.openUntilAtLeast().call(),
            contracts.dat.methods.state().call(),
          ]);

          contracts.data.totalSupply = new BigNumber(totalSupply).shiftedBy(-contracts.data.decimals);
          contracts.data.burnedSupply = new BigNumber(burnedSupply).shiftedBy(-contracts.data.decimals);
          contracts.data.name = name;
          contracts.data.symbol = symbol;
          contracts.data.beneficiary = beneficiary;
          contracts.data.control = control;
          contracts.data.feeCollector = feeCollector;
          contracts.data.burnThreshold = new BigNumber(burnThreshold).div(constants.BASIS_POINTS_DEN);
          contracts.data.buybackReserve = new BigNumber(buybackReserve).shiftedBy(-contracts.data.currency.decimals);
          contracts.data.fee = new BigNumber(fee).div(constants.BASIS_POINTS_DEN);
          contracts.data.minInvestment = new BigNumber(minInvestment).shiftedBy(-contracts.data.currency.decimals);
          contracts.data.openUntilAtLeast = openUntilAtLeast;
          contracts.data.state = constants.STATES[stateId];
        },
        approve: async () => await contracts.sendTx(contracts.currency.methods.approve(contracts.dat._address, -1)),
        kyc: async (account, isApproved) => await contracts.sendTx(contracts.erc1404.methods.approve(account, isApproved)),
        estimateBuyValue: async (currencyAmount) => {
          if (!currencyAmount) return 0;
          const currencyValue = new BigNumber(currencyAmount).shiftedBy(contracts.data.currency.decimals);
          const buyValue = await contracts.dat.methods.estimateBuyValue(currencyValue.toFixed()).call();
          return new BigNumber(buyValue).shiftedBy(-contracts.data.decimals);
        },
        buy: async (currencyAmount, maxSlipPercent, sendToAddress = undefined) => {
          let sendTo;
          if (sendToAddress && sendToAddress !== contracts.web3.utils.padLeft(0, 40)) {
            sendTo = sendToAddress;
          } else {
            sendTo = contracts.data.account.address;
          }
          const estimateBuyValue = await contracts.helpers.estimateBuyValue(currencyAmount);
          if (!estimateBuyValue || estimateBuyValue.eq(0)) throw new Error('0 expected value');
          const currencyValue = new BigNumber(currencyAmount).shiftedBy(contracts.data.currency.decimals).dp(0);
          const minBuyValue = estimateBuyValue.times(new BigNumber(100).minus(maxSlipPercent).div(100)).shiftedBy(contracts.data.decimals).dp(0);
          return await contracts.sendTx(contracts.dat.methods.buy(sendTo, currencyValue.toFixed(), minBuyValue.toFixed()));
        },
        estimateSellValue: async (tokenAmount) => {
          if (!tokenAmount) return 0;
          const tokenValue = new BigNumber(tokenAmount).shiftedBy(contracts.data.currency.decimals);
          try {
            const sellValue = await contracts.dat.methods.estimateSellValue(tokenValue.toFixed()).call();
            return new BigNumber(sellValue).shiftedBy(-contracts.data.decimals);
          } catch (e) {
            // likely > totalSupply
            return new BigNumber(0);
          }
        },
        sell: async (tokenAmount, maxSlipPercent, sendToAddress = undefined) => {
          let sendTo;
          if (sendToAddress && sendToAddress !== contracts.web3.utils.padLeft(0, 40)) {
            sendTo = sendToAddress;
          } else {
            sendTo = contracts.data.account.address;
          }
          const estimateSellValue = await contracts.helpers.estimateSellValue(tokenAmount);
          if (!estimateSellValue || estimateSellValue.eq(0)) throw new Error('0 expected value');
          const tokenValue = new BigNumber(tokenAmount).shiftedBy(contracts.data.currency.decimals).dp(0);
          const minSellValue = estimateSellValue.times(new BigNumber(100).minus(maxSlipPercent).div(100)).shiftedBy(contracts.data.decimals).dp(0);
          return await contracts.sendTx(contracts.dat.methods.sell(sendTo, tokenValue.toFixed(), minSellValue.toFixed()));
        },
        estimatePayValue: async (currencyAmount) => {
          if (!currencyAmount) return 0;
          const currencyValue = new BigNumber(currencyAmount).shiftedBy(contracts.data.currency.decimals);
          const payValue = await contracts.dat.methods.estimatePayValue(currencyValue.toFixed()).call();
          return new BigNumber(payValue).shiftedBy(-contracts.data.decimals);
        },
        pay: async (currencyAmount, sendToAddress = undefined) => {
          let sendTo;
          if (sendToAddress && sendToAddress !== contracts.web3.utils.padLeft(0, 40)) {
            sendTo = sendToAddress;
          } else {
            sendTo = contracts.data.account.address;
          }
          const currencyValue = new BigNumber(currencyAmount).shiftedBy(contracts.data.currency.decimals).dp(0);
          return await contracts.sendTx(contracts.dat.methods.pay(sendTo, currencyValue.toFixed()));
        },
        burn: async (tokenAmount) => {
          const tokenValue = new BigNumber(tokenAmount).shiftedBy(contracts.data.currency.decimals).dp(0);
          return await contracts.sendTx(contracts.fair.methods.burn(tokenValue.toFixed(), []));
        },
      };
    }
    return contracts;
  }
}
